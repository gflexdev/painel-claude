// Telas do widget nos três tamanhos, no visual de bancada do painel web.
import SwiftUI
import WidgetKit

private enum Fonte {
    static func nome(_ tamanho: CGFloat) -> Font { .system(size: tamanho, weight: .bold, design: .rounded) }
    static func mono(_ tamanho: CGFloat, _ peso: Font.Weight = .regular) -> Font {
        .system(size: tamanho, weight: peso, design: .monospaced)
    }
}

/// Prévia fora do WidgetKit (o ImageRenderer não desenha `Link`).
enum Previa {
    nonisolated(unsafe) static var semLinks = false
}

private func linkSessao(_ id: String?) -> URL {
    guard let id else { return URL(string: "painelclaude://painel")! }
    return URL(string: "painelclaude://sessao/\(id)") ?? URL(string: "painelclaude://painel")!
}

struct VistaWidget: View {
    @Environment(\.widgetFamily) private var familiaDoSistema
    let entrada: Entrada
    /// Só para gerar prévias fora do WidgetKit.
    var familiaFixa: WidgetFamily?

    private var familia: WidgetFamily { familiaFixa ?? familiaDoSistema }

    private var sessoes: [Sessao] { entrada.estado?.sessoes ?? [] }

    /// Primeira sessão (na ordem do painel) com pedido completo já carregado.
    private var comPedido: (sessao: Sessao, pedido: Pedido)? {
        for s in sessoes where s.permission != nil {
            if let p = entrada.estado?.pedidos[s.id] { return (s, p) }
        }
        return nil
    }

    private var avisoRecente: Aviso? {
        let limite = entrada.date.addingTimeInterval(-60)
        return entrada.estado?.avisos.values.filter { $0.em > limite }.max { $0.em < $1.em }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: familia == .systemSmall ? 6 : 8) {
            Cabecalho(sessoes: sessoes, conectado: entrada.estado?.conectado ?? false, compacto: familia == .systemSmall)
            if entrada.appParado {
                Faixa(texto: entrada.estado == nil ? "Abra o app Painel Claude" : "App Painel Claude fechado", cor: Tema.esperando)
            } else if let estado = entrada.estado, !estado.conectado {
                Faixa(texto: "Mac sem resposta do painel", cor: Tema.esperando)
            }
            // Com pedido na tela, o aviso só cabe no grande.
            if let aviso = avisoRecente, comPedido == nil || familia == .systemLarge {
                Text(aviso.texto)
                    .font(Fonte.mono(10, .semibold))
                    .foregroundStyle(aviso.ok ? Tema.parada : Tema.esperando)
                    .lineLimit(1)
            }
            conteudo
            Spacer(minLength: 0)
        }
        .widgetURL(linkSessao(comPedido?.sessao.id ?? sessoes.first?.id))
    }

    @ViewBuilder private var conteudo: some View {
        let outros = sessoes.filter { $0.id != comPedido?.sessao.id }
        switch familia {
        case .systemSmall:
            if let (s, p) = comPedido {
                CartaoPedido(sessao: s, pedido: p, enviando: entrada.enviando.contains(p.id), compacto: true)
            } else {
                ListaSessoes(sessoes: Array(sessoes.prefix(3)), agora: entrada.agoraServidor, compacto: true)
            }
        case .systemMedium:
            if let (s, p) = comPedido {
                CartaoPedido(sessao: s, pedido: p, enviando: entrada.enviando.contains(p.id), compacto: false)
                Rodape(restantes: outros.count, esperando: outros.filter { $0.status == "waiting" }.count)
            } else {
                ListaSessoes(sessoes: Array(sessoes.prefix(3)), agora: entrada.agoraServidor, compacto: false)
                Rodape(restantes: max(0, sessoes.count - 3), esperando: 0)
            }
        default:
            let limite = comPedido == nil ? 7 : 5
            if let (s, p) = comPedido {
                CartaoPedido(sessao: s, pedido: p, enviando: entrada.enviando.contains(p.id), compacto: false)
            }
            ListaSessoes(sessoes: Array(outros.prefix(limite)), agora: entrada.agoraServidor, compacto: false)
            Rodape(restantes: max(0, outros.count - limite), esperando: 0)
        }
    }
}

// MARK: - Cabeçalho e faixas

private struct Cabecalho: View {
    let sessoes: [Sessao]
    let conectado: Bool
    let compacto: Bool

    var body: some View {
        let esperando = sessoes.filter { $0.status == "waiting" }.count
        let rodando = sessoes.filter { $0.status == "working" }.count
        let ver = sessoes.filter(\.naoViu).count
        HStack(spacing: compacto ? 6 : 10) {
            Marca()
            if !compacto {
                Text("Claude").font(Fonte.nome(13)).foregroundStyle(Tema.tinta)
            }
            Spacer(minLength: 0)
            Contador(valor: esperando, cor: Tema.esperando, rotulo: compacto ? nil : "esperando")
            Contador(valor: rodando, cor: Tema.rodando, rotulo: compacto ? nil : "rodando")
            Contador(valor: ver, cor: Tema.naoViu, rotulo: compacto ? nil : "ver")
            Circle()
                .fill(conectado ? Tema.parada : Tema.esperando)
                .frame(width: 6, height: 6)
                .accessibilityLabel(conectado ? "conectado" : "sem conexão")
        }
    }
}

/// Os três quadradinhos da marca do painel.
private struct Marca: View {
    var body: some View {
        ZStack(alignment: .topLeading) {
            Rectangle().fill(Tema.parada).frame(width: 6, height: 6).offset(x: 0, y: 6)
            Rectangle().fill(Tema.esperando).frame(width: 6, height: 6).offset(x: 12, y: 6)
            Rectangle().fill(Tema.rodando).frame(width: 6, height: 6).offset(x: 6, y: 0)
        }
        .frame(width: 18, height: 12, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}

private struct Contador: View {
    let valor: Int
    let cor: Color
    let rotulo: String?

    var body: some View {
        HStack(spacing: 3) {
            Text("\(valor)")
                .font(Fonte.nome(13))
                .foregroundStyle(valor == 0 ? Tema.tintaApagada : cor)
            if let rotulo {
                Text(rotulo).font(Fonte.mono(9)).foregroundStyle(Tema.tintaFraca)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private struct Faixa: View {
    let texto: String
    let cor: Color

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(cor).frame(width: 6, height: 6)
            Text(texto).font(Fonte.mono(10, .semibold)).foregroundStyle(Tema.tinta).lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 6).fill(cor.opacity(0.18)))
    }
}

private struct Rodape: View {
    let restantes: Int
    let esperando: Int

    var body: some View {
        if restantes > 0 {
            let extra = esperando > 0 ? " · \(esperando) esperando" : ""
            Text("+ \(restantes) sessões\(extra)")
                .font(Fonte.mono(9))
                .foregroundStyle(esperando > 0 ? Tema.esperando : Tema.tintaApagada)
        }
    }
}

// MARK: - Lista de sessões

private struct ListaSessoes: View {
    let sessoes: [Sessao]
    let agora: Double
    let compacto: Bool

    var body: some View {
        if sessoes.isEmpty {
            Text("Nenhuma sessão do Claude Code aberta.")
                .font(Fonte.mono(10))
                .foregroundStyle(Tema.tintaFraca)
        } else {
            VStack(alignment: .leading, spacing: compacto ? 5 : 6) {
                ForEach(sessoes) { s in
                    if Previa.semLinks {
                        LinhaSessao(sessao: s, agora: agora, compacto: compacto)
                    } else {
                        Link(destination: linkSessao(s.id)) {
                            LinhaSessao(sessao: s, agora: agora, compacto: compacto)
                        }
                    }
                }
            }
        }
    }
}

private struct LinhaSessao: View {
    let sessao: Sessao
    let agora: Double
    let compacto: Bool

    var body: some View {
        let cor = Tema.cor(de: sessao)
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 1.5).fill(cor).frame(width: 3)
            ClawdView(sessao: sessao).frame(width: 30, height: 17)
            VStack(alignment: .leading, spacing: 1) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(sessao.name)
                        .font(Fonte.nome(compacto ? 11 : 12))
                        .foregroundStyle(Tema.tinta)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if !compacto {
                        Text(Formato.decorrido(desde: sessao.since, agora: agora))
                            .font(Fonte.mono(9))
                            .foregroundStyle(Tema.tintaApagada)
                    }
                }
                Text(compacto ? Formato.situacao(sessao) : linhaInferior)
                    .font(Fonte.mono(9))
                    .foregroundStyle(cor)
                    .lineLimit(1)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .opacity(sessao.status == "ended" ? 0.45 : 1)
        .accessibilityElement(children: .combine)
    }

    private var linhaInferior: String {
        let detalhe = Formato.detalhe(sessao, agora: agora)
        let situacao = Formato.situacao(sessao)
        let repetido = detalhe.isEmpty || situacao.hasPrefix(detalhe) || Formato.palavraSituacao[sessao.status] == detalhe
        let partes = [situacao, sessao.project ?? "", repetido ? "" : detalhe]
        return partes.filter { !$0.isEmpty }.joined(separator: " · ")
    }
}

// MARK: - Pedido pendente

private struct CartaoPedido: View {
    let sessao: Sessao
    let pedido: Pedido
    let enviando: Bool
    let compacto: Bool

    var body: some View {
        let cor = Tema.cor(de: pedido.tipo)
        VStack(alignment: .leading, spacing: compacto ? 4 : 6) {
            HStack(spacing: 6) {
                ClawdView(sessao: sessao).frame(width: 30, height: 17)
                VStack(alignment: .leading, spacing: 0) {
                    Text(sessao.name).font(Fonte.nome(compacto ? 11 : 12)).foregroundStyle(Tema.tinta).lineLimit(1)
                    Text(subtitulo).font(Fonte.mono(9, .semibold)).foregroundStyle(cor).lineLimit(1)
                }
            }
            if let texto = textoDoPedido, !texto.isEmpty {
                Text(texto)
                    .font(Fonte.mono(compacto ? 9 : 10))
                    .foregroundStyle(Tema.tinta.opacity(0.85))
                    .lineLimit(compacto ? 2 : 2)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 5).fill(Tema.fundo.opacity(0.7)))
            }
            if enviando {
                Text("enviando…").font(Fonte.mono(10, .semibold)).foregroundStyle(Tema.tintaFraca)
            } else {
                botoes(cor: cor)
            }
        }
        .padding(compacto ? 6 : 8)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Tema.tile)
                .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(cor.opacity(0.55), lineWidth: 1))
        )
    }

    private var subtitulo: String {
        let titulo = Formato.tituloPedido(pedido.tipo)
        guard pedido.tipo == .permissao, let ferramenta = pedido.tool else { return titulo }
        return compacto ? ferramenta : "\(titulo) · \(ferramenta)"
    }

    private var textoDoPedido: String? {
        if let pergunta = pedido.questions?.first, pedido.tipo == .pergunta { return pergunta.question }
        return pedido.preview?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    @ViewBuilder private func botoes(cor: Color) -> some View {
        if pedido.tipo == .pergunta {
            if let pergunta = pedido.perguntaSimples, let opcoes = pergunta.options,
               opcoes.count <= (compacto ? 2 : 4) {
                HStack(spacing: 4) {
                    ForEach(opcoes, id: \.label) { opcao in
                        Botao(rotulo: opcao.label, cor: Tema.pergunta, cheio: false, intent: DecidirPedido(
                            pedidoId: pedido.id, sessaoId: sessao.id, decisao: "allow",
                            pergunta: pergunta.question, opcao: opcao.label
                        ))
                    }
                }
            } else {
                AbrirNoPainel(sessao: sessao.id)
            }
        } else {
            let textos = Formato.botoes(pedido.tipo)
            HStack(spacing: 6) {
                Botao(rotulo: textos.sim, cor: cor, cheio: true,
                      intent: DecidirPedido(pedidoId: pedido.id, sessaoId: sessao.id, decisao: "allow"))
                Botao(rotulo: textos.nao, cor: Tema.tintaFraca, cheio: false,
                      intent: DecidirPedido(pedidoId: pedido.id, sessaoId: sessao.id, decisao: "deny"))
            }
        }
    }
}

private struct Botao: View {
    let rotulo: String
    let cor: Color
    let cheio: Bool
    let intent: DecidirPedido

    var body: some View {
        Button(intent: intent) {
            Text(rotulo)
                .font(Fonte.mono(10, .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(cheio ? Tema.fundo : Tema.tinta)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(cheio ? cor : Tema.tileHi)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(cor.opacity(cheio ? 0 : 0.6), lineWidth: 1))
                )
        }
        .buttonStyle(.plain)
    }
}

private struct AbrirNoPainel: View {
    let sessao: String

    var body: some View {
        Link(destination: linkSessao(sessao)) {
            Text("Responder no painel ›")
                .font(Fonte.mono(10, .bold))
                .foregroundStyle(Tema.pergunta)
        }
    }
}
