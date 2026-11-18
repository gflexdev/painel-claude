// Escuta o SSE do servidor, grava o estado para o widget e só recarrega o widget quando algo que ele mostra
// mudou (o WidgetKit tem orçamento de recargas). Também envia as decisões que o widget deixa na pasta.
import Foundation
import WidgetKit
import os

@MainActor
final class Sincronizador: ObservableObject {
    @Published private(set) var conectado = false
    @Published private(set) var erro: String?
    @Published private(set) var sessoes: [Sessao] = []

    /// Mudança "de detalhe" (ferramenta em uso, atividade) recarrega no máximo uma vez por este intervalo.
    private static let intervaloDetalhe: TimeInterval = 60
    private static let esperaReconexao: [UInt64] = [1, 2, 5, 10, 30]
    private static let varreduraDecisoes: TimeInterval = 5
    private static let validadeAviso: TimeInterval = 120

    private let log = Logger(subsystem: "br.com.gflex.painel-claude.mac", category: "sync")
    private var token: String?
    private var estado = EstadoCompartilhado.vazio
    private var chaveUrgente = ""
    private var chaveDetalhe = ""
    private var ultimaRecarga = Date.distantPast
    private var recargaAgendada: Task<Void, Never>?
    private var enviando = Set<String>()
    private var vigia: DispatchSourceFileSystemObject?
    private var tarefaStream: Task<Void, Never>?
    private var buscandoPedido = Set<String>()

    func iniciar() {
        do { try Armazem.prepararPastas() } catch { log.error("pasta compartilhada: \(error.localizedDescription)") }
        if let anterior = Armazem.lerEstado() { estado = anterior }
        estado.conectado = false
        vigiarDecisoes()
        tarefaStream = Task { await laco() }
    }

    func recarregarToken() {
        do {
            token = try Token.importarDoConfig()
            erro = nil
            tarefaStream?.cancel()
            tarefaStream = Task { await laco() }
        } catch {
            erro = error.localizedDescription
        }
    }

    // MARK: - Stream

    private func laco() async {
        var tentativa = 0
        while !Task.isCancelled {
            do {
                let token = try self.token ?? Token.carregar()
                self.token = token
                for try await snapshot in Cliente(token: token).stream() {
                    tentativa = 0
                    await receber(snapshot)
                }
            } catch is CancellationError {
                return
            } catch let falha as ErroServidor where falha.status == 401 {
                // Token trocado no servidor: lê de novo o config.json.
                token = try? Token.importarDoConfig()
                marcarDesconectado("token recusado pelo servidor; reimportei do config.json")
            } catch {
                if Task.isCancelled { return }
                marcarDesconectado(error.localizedDescription)
            }
            let espera = Self.esperaReconexao[min(tentativa, Self.esperaReconexao.count - 1)]
            tentativa += 1
            try? await Task.sleep(nanoseconds: espera * 1_000_000_000)
        }
    }

    private func marcarDesconectado(_ motivo: String) {
        log.notice("sem conexão: \(motivo, privacy: .public)")
        let mudou = conectado || erro != motivo
        conectado = false
        erro = motivo
        estado.conectado = false
        estado.erro = motivo
        estado.atualizadoEm = Date()
        if mudou { gravarERecarregar(urgente: true) }
    }

    private func receber(_ snapshot: Snapshot) async {
        conectado = true
        erro = nil
        sessoes = snapshot.sessions
        let estavaDesconectado = !estado.conectado
        estado.conectado = true
        estado.erro = nil
        estado.sessoes = snapshot.sessions
        estado.desvioRelogio = snapshot.now - Date().timeIntervalSince1970 * 1000
        estado.atualizadoEm = Date()

        let comPedido = Dictionary(uniqueKeysWithValues: snapshot.sessions.compactMap { s in s.permission.map { (s.id, $0) } })
        estado.pedidos = estado.pedidos.filter { comPedido[$0.key]?.id == $0.value.id }
        for (sessaoId, resumo) in comPedido where estado.pedidos[sessaoId] == nil {
            await buscarPedido(sessao: sessaoId, esperado: resumo.id)
        }
        let limite = Date().addingTimeInterval(-Self.validadeAviso)
        estado.avisos = estado.avisos.filter { $0.value.em > limite }

        let urgente = snapshot.sessions.map { s in
            [s.id, s.name, s.status, s.permission?.id ?? "", s.naoViu ? "v" : "", s.semSinal ? "s" : ""].joined(separator: "|")
        }.joined(separator: "\n") + estado.pedidos.keys.sorted().joined()
        let detalhe = snapshot.sessions.map { "\($0.id)|\($0.detail ?? "")|\($0.activity ?? "")" }.joined(separator: "\n")

        if urgente != chaveUrgente || estavaDesconectado {
            chaveUrgente = urgente
            chaveDetalhe = detalhe
            gravarERecarregar(urgente: true)
        } else if detalhe != chaveDetalhe {
            chaveDetalhe = detalhe
            gravarERecarregar(urgente: false)
        }
    }

    private func buscarPedido(sessao id: String, esperado: String) async {
        guard let token, !buscandoPedido.contains(id) else { return }
        buscandoPedido.insert(id)
        defer { buscandoPedido.remove(id) }
        do {
            let detalhe = try await Cliente(token: token).detalhe(sessao: id)
            if let pedido = detalhe.permissions?.first(where: { $0.id == esperado }) ?? detalhe.permissions?.first {
                estado.pedidos[id] = pedido
            }
        } catch {
            log.error("detalhe da sessão: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Gravar e recarregar o widget

    private func gravarERecarregar(urgente: Bool) {
        do { try Armazem.gravarEstado(estado) } catch { log.error("gravar estado: \(error.localizedDescription)") }
        if urgente {
            recargaAgendada?.cancel()
            recarregarAgora()
            return
        }
        guard recargaAgendada == nil else { return }
        let espera = max(0, Self.intervaloDetalhe - Date().timeIntervalSince(ultimaRecarga))
        recargaAgendada = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(espera * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.recarregarAgora()
        }
    }

    private func recarregarAgora() {
        recargaAgendada = nil
        ultimaRecarga = Date()
        WidgetCenter.shared.reloadTimelines(ofKind: Armazem.kindWidget)
    }

    // MARK: - Decisões vindas do widget

    private func vigiarDecisoes() {
        let fd = open(Armazem.pastaDecisoes.path, O_EVTONLY)
        if fd >= 0 {
            let fonte = DispatchSource.makeFileSystemObjectSource(fileDescriptor: fd, eventMask: .write, queue: .main)
            fonte.setEventHandler { [weak self] in Task { @MainActor in self?.processarDecisoes() } }
            fonte.setCancelHandler { close(fd) }
            fonte.resume()
            vigia = fonte
        }
        // Rede de segurança caso algum evento do sistema de arquivos se perca.
        Timer.scheduledTimer(withTimeInterval: Self.varreduraDecisoes, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.processarDecisoes() }
        }
        processarDecisoes()
    }

    private func processarDecisoes() {
        for (url, decisao) in Armazem.decisoesPendentes() where !enviando.contains(url.lastPathComponent) {
            if Date().timeIntervalSince(decisao.criadaEm) > Armazem.validadeDecisao {
                try? FileManager.default.removeItem(at: url)
                continue
            }
            enviando.insert(url.lastPathComponent)
            Task { await enviar(decisao, arquivo: url) }
        }
    }

    private func enviar(_ decisao: Decisao, arquivo: URL) async {
        defer {
            try? FileManager.default.removeItem(at: arquivo)
            enviando.remove(arquivo.lastPathComponent)
            gravarERecarregar(urgente: true)
        }
        // Só vale para o pedido que está pendente agora nessa sessão (o widget só mostra botões para ele).
        guard decisao.decisao == "allow" || decisao.decisao == "deny",
              let pendente = estado.pedidos[decisao.sessaoId], pendente.id == decisao.pedidoId,
              decisao.pedidoId.range(of: #"^[A-Za-z0-9_-]{1,80}$"#, options: .regularExpression) != nil else {
            estado.avisos[decisao.pedidoId] = Aviso(texto: "Esse pedido não está mais pendente.", ok: false, em: Date())
            return
        }
        let tipo = pendente.tipo
        var respostas: [String: String]?
        if let pergunta = decisao.pergunta, let opcao = decisao.opcao, decisao.decisao == "allow" {
            respostas = [pergunta: opcao]
        }
        do {
            let token = try self.token ?? Token.carregar()
            try await Cliente(token: token).decidir(pedido: decisao.pedidoId, decisao: decisao.decisao, respostas: respostas)
            estado.avisos[decisao.pedidoId] = Aviso(texto: Self.textoSucesso(decisao, tipo: tipo), ok: true, em: Date())
        } catch let falha as ErroServidor where falha.status == 410 || falha.status == 404 {
            estado.avisos[decisao.pedidoId] = Aviso(texto: "Esse pedido já foi respondido no Mac.", ok: false, em: Date())
        } catch {
            estado.avisos[decisao.pedidoId] = Aviso(
                texto: "Não consegui enviar (\(error.localizedDescription)).", ok: false, em: Date()
            )
        }
    }

    private static func textoSucesso(_ decisao: Decisao, tipo: TipoPedido) -> String {
        if decisao.decisao == "deny" { return "✕ Recusado. O Claude foi avisado." }
        switch tipo {
        case .permissao: return "✓ Permitido. O Claude segue."
        case .plano: return "✓ Plano aprovado."
        case .pergunta: return "✓ Resposta enviada: \(decisao.opcao ?? "")"
        }
    }
}
