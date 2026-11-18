// O widget: lê o estado que o app hospedeiro grava e monta uma linha do tempo de um minuto em um minuto
// (só para o "há quanto tempo" andar; o conteúdo muda quando o app manda recarregar).
import SwiftUI
import WidgetKit

struct Entrada: TimelineEntry {
    let date: Date
    let estado: EstadoCompartilhado?
    let enviando: Set<String>

    /// Agora no relógio do servidor, em ms.
    var agoraServidor: Double { date.timeIntervalSince1970 * 1000 + (estado?.desvioRelogio ?? 0) }

    /// O app hospedeiro grava ao menos a cada mudança; se o estado está velho e desconectado, ele não está rodando.
    var appParado: Bool {
        guard let estado else { return true }
        return !estado.conectado && date.timeIntervalSince(estado.atualizadoEm) > 120
    }

    static let exemplo: Entrada = {
        let agora = Date().timeIntervalSince1970 * 1000
        func sessao(_ id: String, _ nome: String, _ projeto: String, _ status: String, _ detalhe: String,
                    atividade: String? = nil, naoViu: Bool = false, pedido: ResumoPedido? = nil, ha: Double) -> Sessao {
            Sessao(id: id, name: nome, project: projeto, origin: "app", status: status, detail: detalhe, activity: atividade,
                   unseen: naoViu, contextTokens: nil, since: agora - ha * 60_000, lastEventAt: agora, stale: false, permission: pedido)
        }
        let sessoes = [
            sessao("a1", "Deploy do site", "site-gflex", "waiting", "permissão: Bash", atividade: "bash",
                   pedido: ResumoPedido(id: "p1", tool: "Bash", count: 1, kind: "permission"), ha: 2),
            sessao("b2", "Corrigir testes", "painel-claude", "idle", "terminou", naoViu: true, ha: 5),
            sessao("c3", "Widget do Mac", "painel-claude", "working", "Edit: Vistas.swift", atividade: "write", ha: 12),
            sessao("d4", "Firmware do display", "firmware", "idle", "parada", ha: 64),
        ]
        let pedido = Pedido(id: "p1", kind: "permission", tool: "Bash", toolName: "Bash",
                            preview: "npm run deploy -- --prod", questions: nil)
        let estado = EstadoCompartilhado(atualizadoEm: Date(), conectado: true, erro: nil, desvioRelogio: 0,
                                         sessoes: sessoes, pedidos: ["a1": pedido], avisos: [:])
        return Entrada(date: Date(), estado: estado, enviando: [])
    }()
}

struct Provedor: TimelineProvider {
    private static let minutosNaLinha = 30

    func placeholder(in context: Context) -> Entrada { .exemplo }

    func getSnapshot(in context: Context, completion: @escaping (Entrada) -> Void) {
        if context.isPreview, Armazem.lerEstado()?.sessoes.isEmpty ?? true {
            completion(.exemplo)
            return
        }
        completion(Entrada(date: Date(), estado: Armazem.lerEstado(), enviando: Armazem.pedidosEnviando()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Entrada>) -> Void) {
        let estado = Armazem.lerEstado()
        let enviando = Armazem.pedidosEnviando()
        let agora = Date()
        let entradas = (0..<Self.minutosNaLinha).map { minuto in
            Entrada(date: agora.addingTimeInterval(Double(minuto) * 60), estado: estado, enviando: enviando)
        }
        completion(Timeline(entries: entradas, policy: .atEnd))
    }
}

struct PainelWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Armazem.kindWidget, provider: Provedor()) { entrada in
            VistaWidget(entrada: entrada)
                .containerBackground(for: .widget) {
                    ZStack {
                        Tema.fundo
                        RadialGradient(colors: [Color(hex: 0x1A1C23), .clear], center: .topLeading, startRadius: 0, endRadius: 260)
                    }
                }
        }
        .configurationDisplayName("Painel Claude")
        .description("Sessões do Claude Code e os pedidos que esperam você.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
