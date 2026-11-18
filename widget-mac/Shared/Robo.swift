// Robozinho de pixel do painel (porte de public/bot.js): corpo pela sessão, chapéu pelo projeto
// e um ícone 4×4 do que ele está fazendo. Mesmo hash e mesmo sorteio, então sai igual ao da web.
import SwiftUI

enum Robo {
    static let colunasCorpo = 9
    static let linhasCorpo = 7
    static let metade = 4
    static let linhasChapeu = 3
    static let tamanhoAcessorio = 4
    static let colunas = colunasCorpo + tamanhoAcessorio
    static let linhas = linhasChapeu + linhasCorpo - 1

    static let chapeus: [[String]] = [
        [".#####.", ".#####.", "#######"],
        ["...#...", ".#####.", "#######"],
        ["#.#.#.#", "#######", "......."],
        ["..####.", ".######", "#######"],
        ["...#...", "..###..", ".#####."],
        [".......", ".......", "#######"],
        ["##...##", ".#...#.", ".#####."],
    ]
    static let coresChapeu: [UInt32] = [0x7AA2FF, 0xFF8FD0, 0xF5D547, 0x5FE0D0, 0xC49BFF, 0xFF9A5C, 0x9BE564, 0xE8E4DC]

    static let acessorios: [String: [String]] = [
        "read": ["###.", "#.#.", "###.", "...#"],
        "write": ["...#", "..#.", ".#..", "#..."],
        "bash": ["#...", ".#..", "#...", "..##"],
        "web": [".##.", "####", "####", ".##."],
        "delegate": [".##.", "####", ".##.", "#..#"],
        "plan": ["#.##", "....", "#.##", "...."],
        "ask": [".##.", "...#", "..#.", "..#."],
        "mcp": ["#..#", "####", ".##.", ".#.."],
        "think": ["....", "....", "#.#.", "...."],
        "compact": ["#..#", ".##.", ".##.", "#..#"],
        "done": ["##..", "###.", "#...", "#..."],
    ]

    /// FNV-1a sobre as unidades UTF-16, como `seedFrom` (charCodeAt) no JS.
    static func semente(_ texto: String) -> UInt32 {
        var h: UInt32 = 2_166_136_261
        for unidade in texto.utf16 {
            h ^= UInt32(unidade)
            h = h &* 16_777_619
        }
        return h == 0 ? 1 : h
    }

    /// xorshift32; os bits batem com a versão em int32 do JS.
    struct Sorteio {
        var estado: UInt32
        mutating func proximo() -> Double {
            estado ^= estado << 13
            estado ^= estado >> 17
            estado ^= estado << 5
            return Double(estado) / 4_294_967_296
        }
    }

    /// Matriz [linha][coluna] do corpo: 0 vazio, 1 corpo, 2 olho/boca. A linha 0 (antena) vira chapéu.
    static func celulas(_ id: String) -> [[Int]] {
        var sorteio = Sorteio(estado: semente(id))
        let antenaDupla = sorteio.proximo() < 0.4
        let bracos = sorteio.proximo() < 0.5
        let cabecaLarga = sorteio.proximo() < 0.5
        let boca = sorteio.proximo() < 0.5
        let colunaPerna = sorteio.proximo() < 0.5 ? 2 : 3
        let entalhes = [sorteio.proximo() < 0.3, sorteio.proximo() < 0.3]

        func celula(_ y: Int, _ x: Int) -> Int {
            if y == 0 { return antenaDupla ? (x == 2 ? 1 : 0) : (x == metade ? 1 : 0) }
            if y == 6 { return x == colunaPerna ? 1 : 0 }
            if x == 0 { return (bracos ? y == 5 : (y == 2 && cabecaLarga)) ? 1 : 0 }
            if y == 2 && x == 2 { return 2 }
            if y == 3 && x >= 2 && boca { return x == metade ? 2 : 1 }
            if y == 4 { return (x >= 3 || (x == 2 && !entalhes[0])) ? 1 : 0 }
            if x == 1 { return (y != 4 && !(y == 1 && entalhes[1])) ? 1 : 0 }
            return 1
        }

        return (0..<linhasCorpo).map { y in
            let meia = (0...metade).map { x in celula(y, x) }
            return meia + meia.prefix(metade).reversed()
        }
    }

    static func chapeu(_ projeto: String) -> (forma: [String], cor: Color) {
        let h = semente(projeto.isEmpty ? "?" : projeto)
        return (chapeus[Int(h % UInt32(chapeus.count))], Color(hex: coresChapeu[Int((h >> 8) % UInt32(coresChapeu.count))]))
    }
}

/// O robozinho desenhado em pixels nítidos.
struct RoboView: View {
    let id: String
    let projeto: String
    let acessorio: String?
    let corCorpo: Color
    var corAcessorio: Color = Tema.tintaFraca
    var corOlho: Color = Tema.tile

    var body: some View {
        Canvas { contexto, tamanho in
            let lado = min(tamanho.width / CGFloat(Robo.colunas), tamanho.height / CGFloat(Robo.linhas))
            let origem = CGPoint(
                x: (tamanho.width - lado * CGFloat(Robo.colunas)) / 2,
                y: (tamanho.height - lado * CGFloat(Robo.linhas)) / 2
            )
            func pixel(_ x: Int, _ y: Int, _ cor: Color) {
                let r = CGRect(x: origem.x + CGFloat(x) * lado, y: origem.y + CGFloat(y) * lado, width: lado * 1.02, height: lado * 1.02)
                contexto.fill(Path(r), with: .color(cor))
            }
            func desenhar(_ padrao: [String], _ dx: Int, _ dy: Int, _ cor: Color) {
                for (y, linha) in padrao.enumerated() {
                    for (x, c) in linha.enumerated() where c == "#" { pixel(dx + x, dy + y, cor) }
                }
            }

            for (y, linha) in Robo.celulas(id).enumerated() where y > 0 {
                for (x, celula) in linha.enumerated() where celula != 0 {
                    pixel(x, y + Robo.linhasChapeu - 1, celula == 2 ? corOlho : corCorpo)
                }
            }
            let chapeu = Robo.chapeu(projeto)
            desenhar(chapeu.forma, 1, 0, chapeu.cor)
            if let nome = acessorio, let glifo = Robo.acessorios[nome] {
                desenhar(glifo, Robo.colunasCorpo, 0, corAcessorio)
            }
        }
        .aspectRatio(CGFloat(Robo.colunas) / CGFloat(Robo.linhas), contentMode: .fit)
        .accessibilityHidden(true)
    }
}

extension RoboView {
    init(sessao: Sessao) {
        let acessorio = Formato.acessorio(sessao)
        self.init(
            id: sessao.id,
            projeto: sessao.project ?? "",
            acessorio: acessorio,
            corCorpo: Tema.cor(de: sessao),
            corAcessorio: acessorio == "done" ? Tema.naoViu : Tema.tintaFraca
        )
    }
}
