// O Clawd, o laranjinha do Claude Code (porte de public/clawd.js): mesmas peças, mesmos pixels. O widget não
// anima, então cada situação vira uma pose parada — a mesma cara que ele faz na web.
import SwiftUI

enum Clawd {
    static let corCorpo = Color(hex: 0xD97757)
    static let tinta = Color(hex: 0x16110D)
    /// Tela da web: colunas 0…19 (16 do bicho + 4 do ícone de atividade) e linhas 1…11.
    static let colunas = 20
    static let linhas = 11
    static let primeiraLinha = 1

    typealias Retangulo = (x: Int, y: Int, largura: Int, altura: Int)

    static let chao: [Retangulo] = [(3, 11, 10, 1)]
    static let pernasA: [Retangulo] = [(3, 9, 1, 2), (10, 9, 1, 2)]
    static let pernasB: [Retangulo] = [(5, 9, 1, 2), (12, 9, 1, 2)]
    static let corpo: [Retangulo] = [(2, 4, 12, 5)]
    static let bracoEsquerdo: [Retangulo] = [(0, 7, 2, 1)]
    static let bracoDireito: [Retangulo] = [(14, 7, 2, 1)]
    static let boca: [Retangulo] = [(7, 7, 2, 1)]

    enum Cara { case aberta, fechada, feliz, xis }

    static let olhos: [Cara: [Retangulo]] = [
        .aberta: [(4, 5, 1, 2), (11, 5, 1, 2)],
        .fechada: [(3, 6, 2, 1), (11, 6, 2, 1)],
        .feliz: [(3, 6, 1, 1), (4, 5, 1, 1), (5, 6, 1, 1), (10, 6, 1, 1), (11, 5, 1, 1), (12, 6, 1, 1)],
        .xis: [
            (3, 4, 1, 1), (5, 4, 1, 1), (4, 5, 1, 1), (3, 6, 1, 1), (5, 6, 1, 1),
            (10, 4, 1, 1), (12, 4, 1, 1), (11, 5, 1, 1), (10, 6, 1, 1), (12, 6, 1, 1),
        ],
    ]

    static let brilho = (x: 0, y: 1, forma: [".#.", "###", ".#."])
    /// Na web o zzz sobe acima do desenho; parado, ele fica na coluna do ícone (vazia quando a sessão dorme).
    static let zzz = (x: 16, y: 1, forma: ["####", "..#.", ".#..", "####"])

    /// O que muda de uma situação para outra: cara, braços (em pixels, negativo é para cima) e enfeites.
    struct Pose: Equatable {
        var cara: Cara = .aberta
        var boca = false
        var bracoEsquerdo = 0
        var bracoDireito = 0
        /// Quanto o corpo afunda nas pernas (dormindo, ele "senta").
        var corpo = 0
        var passo = false
        var brilho = false
        var zzz = false
        var apagado = false
    }

    static func pose(_ sessao: Sessao) -> Pose {
        if sessao.naoViu { return Pose(cara: .feliz, bracoEsquerdo: -2, bracoDireito: -2, brilho: true) }
        switch sessao.status {
        case "working": return Pose(bracoEsquerdo: -1, passo: true)
        case "waiting": return Pose(boca: true, bracoDireito: -2)
        case "idle": return Pose(cara: .fechada, corpo: 1, zzz: true)
        case "error": return Pose(cara: .xis, bracoEsquerdo: 1, bracoDireito: 1)
        default: return Pose(cara: .fechada, apagado: true)
        }
    }
}

/// O Clawd desenhado em pixels nítidos.
struct ClawdView: View {
    let pose: Clawd.Pose
    let acessorio: String?
    /// A cor da situação: vai no chão embaixo dele, como `currentColor` na web.
    let corSituacao: Color
    var corAcessorio: Color = Tema.tintaFraca

    var body: some View {
        Canvas { contexto, tamanho in
            // Lado do pixel em múltiplos de meio ponto (um pixel de tela no Retina), para não borrar.
            let bruto = min(tamanho.width / CGFloat(Clawd.colunas), tamanho.height / CGFloat(Clawd.linhas))
            let lado = max(0.5, (bruto * 2).rounded(.down) / 2)
            let origem = CGPoint(
                x: ((tamanho.width - lado * CGFloat(Clawd.colunas)) / 2).rounded(),
                y: ((tamanho.height - lado * CGFloat(Clawd.linhas)) / 2).rounded()
            )
            func pintar(_ retangulos: [Clawd.Retangulo], _ cor: Color, dy: Int = 0, opacidade: Double = 1) {
                for r in retangulos {
                    let caixa = CGRect(
                        x: origem.x + CGFloat(r.x) * lado,
                        y: origem.y + CGFloat(r.y + dy - Clawd.primeiraLinha) * lado,
                        width: CGFloat(r.largura) * lado,
                        height: CGFloat(r.altura) * lado
                    )
                    contexto.fill(Path(caixa), with: .color(cor.opacity(opacidade)))
                }
            }
            func desenho(_ forma: [String], _ x: Int, _ y: Int, _ cor: Color) {
                for (linha, texto) in forma.enumerated() {
                    for (coluna, c) in texto.enumerated() where c == "#" {
                        pintar([(x + coluna, y + linha, 1, 1)], cor)
                    }
                }
            }

            let corpo = pose.apagado ? Tema.encerrada : Clawd.corCorpo
            pintar(Clawd.chao, corSituacao, opacidade: 0.45)
            pintar(Clawd.pernasA, corpo, dy: pose.passo ? -1 : 0)
            pintar(Clawd.pernasB, corpo)
            pintar(Clawd.bracoEsquerdo, corpo, dy: pose.corpo + pose.bracoEsquerdo)
            pintar(Clawd.bracoDireito, corpo, dy: pose.corpo + pose.bracoDireito)
            pintar(Clawd.corpo, corpo, dy: pose.corpo)
            pintar(Clawd.olhos[pose.cara] ?? [], Clawd.tinta, dy: pose.corpo)
            if pose.boca { pintar(Clawd.boca, Clawd.tinta, dy: pose.corpo) }
            if pose.brilho { desenho(Clawd.brilho.forma, Clawd.brilho.x, Clawd.brilho.y, Tema.naoViu) }
            if pose.zzz { desenho(Clawd.zzz.forma, Clawd.zzz.x, Clawd.zzz.y, Tema.tintaFraca) }
            if let nome = acessorio, let glifo = Robo.acessorios[nome] {
                desenho(glifo, 16, 1, corAcessorio)
            }
        }
        .aspectRatio(CGFloat(Clawd.colunas) / CGFloat(Clawd.linhas), contentMode: .fit)
        .accessibilityHidden(true)
    }
}

extension ClawdView {
    init(sessao: Sessao) {
        let acessorio = Formato.acessorio(sessao)
        self.init(
            pose: Clawd.pose(sessao),
            acessorio: acessorio,
            corSituacao: Tema.cor(de: sessao),
            corAcessorio: acessorio == "done" ? Tema.naoViu : Tema.tintaFraca
        )
    }
}
