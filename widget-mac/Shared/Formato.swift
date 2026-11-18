// Palavras e cores do painel web (public/format.js e os tokens de public/style.css).
import SwiftUI

enum Tema {
    static let fundo = Color(hex: 0x0E0F12)
    static let tile = Color(hex: 0x181A20)
    static let tileHi = Color(hex: 0x20232B)
    static let linha = Color(hex: 0x2A2E38)
    static let tinta = Color(hex: 0xECEAE4)
    static let tintaFraca = Color(hex: 0x8D919C)
    static let tintaApagada = Color(hex: 0x5B606C)

    static let rodando = Color(hex: 0xFFB238)
    static let esperando = Color(hex: 0xFF4F6A)
    static let parada = Color(hex: 0x4FD18B)
    static let erro = Color(hex: 0xD36CFF)
    static let encerrada = Color(hex: 0x5B606C)
    static let naoViu = Color(hex: 0x7AA2FF)
    static let pergunta = Color(hex: 0x5FE0D0)

    /// A cor da faixa do tile (`--c` no CSS).
    static func cor(de sessao: Sessao) -> Color {
        if sessao.semSinal { return tintaFraca }
        if sessao.naoViu { return naoViu }
        switch sessao.status {
        case "working": return rodando
        case "waiting": return esperando
        case "idle": return parada
        case "error": return erro
        default: return encerrada
        }
    }

    static func cor(de tipo: TipoPedido) -> Color {
        tipo == .pergunta ? pergunta : esperando
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

enum Formato {
    static let palavraSituacao: [String: String] = [
        "working": "rodando",
        "waiting": "esperando você",
        "idle": "parada",
        "error": "erro",
        "ended": "encerrada",
    ]

    static let palavraAtividade: [String: String] = [
        "read": "lendo",
        "write": "editando",
        "bash": "rodando comando",
        "web": "na web",
        "delegate": "delegando",
        "plan": "planejando",
        "ask": "perguntando",
        "mcp": "usando conector",
        "think": "pensando",
        "compact": "compactando",
    ]

    /// Mesma regra de `statusWord` do painel web.
    static func situacao(_ sessao: Sessao) -> String {
        if let pedido = sessao.permission {
            let verbo: String
            switch pedido.kind {
            case "question": verbo = "responder"
            case "plan": verbo = "aprovar plano"
            default: verbo = "aprovar?"
            }
            if let total = pedido.count, total > 1 { return "\(verbo) (\(total))" }
            return verbo
        }
        if sessao.naoViu { return "terminou · ver" }
        if sessao.status == "working", let atividade = sessao.activity {
            return palavraAtividade[atividade] ?? "rodando"
        }
        return palavraSituacao[sessao.status] ?? sessao.status
    }

    /// Mesma regra de `elapsed` do painel web; tempos em ms.
    static func decorrido(desde: Double, agora: Double) -> String {
        let segundos = max(0, Int(((agora - desde) / 1000).rounded()))
        if segundos < 10 { return "agora" }
        if segundos < 60 { return "\(segundos)s" }
        let minutos = segundos / 60
        if minutos < 60 { return "\(minutos) min" }
        let horas = minutos / 60
        if horas < 48 { return "\(horas) h \(String(format: "%02d", minutos % 60))" }
        return "\(horas / 24) d"
    }

    static func detalhe(_ sessao: Sessao, agora: Double) -> String {
        if sessao.semSinal, let ultimo = sessao.lastEventAt {
            return "sem sinal há \(decorrido(desde: ultimo, agora: agora))"
        }
        return sessao.detail ?? ""
    }

    /// Ícone do robozinho: atividade enquanto trabalha ou espera; bandeira quando terminou e você não viu.
    static func acessorio(_ sessao: Sessao) -> String? {
        if sessao.naoViu { return "done" }
        if sessao.status == "working" || sessao.status == "waiting" { return sessao.activity ?? "think" }
        return nil
    }

    static func tituloPedido(_ tipo: TipoPedido) -> String {
        switch tipo {
        case .permissao: return "Pedido de permissão"
        case .plano: return "Plano para aprovar"
        case .pergunta: return "Pergunta do Claude"
        }
    }

    static func botoes(_ tipo: TipoPedido) -> (sim: String, nao: String) {
        switch tipo {
        case .permissao: return ("Permitir", "Negar")
        case .plano: return ("Aprovar", "Recusar")
        case .pergunta: return ("Responder", "Dispensar")
        }
    }
}
