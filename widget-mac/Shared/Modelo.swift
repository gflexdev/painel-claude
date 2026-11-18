// Formato das sessões e pedidos, como o servidor do painel manda (GET /api/sessions e /api/sessions/:id),
// e o estado que o app hospedeiro grava para o widget ler.
import Foundation

/// Resumo do pedido pendente que vem em cada item do snapshot.
struct ResumoPedido: Codable, Hashable {
    let id: String
    let tool: String?
    let count: Int?
    let kind: String?
}

struct Sessao: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let project: String?
    let origin: String?
    let status: String
    let detail: String?
    let activity: String?
    let unseen: Bool?
    let contextTokens: Int?
    let since: Double
    let lastEventAt: Double?
    let stale: Bool?
    let permission: ResumoPedido?

    var naoViu: Bool { status == "idle" && unseen == true }
    var semSinal: Bool { stale == true }
}

struct Opcao: Codable, Hashable {
    let label: String
    let description: String?
}

struct Pergunta: Codable, Hashable {
    let question: String
    let header: String?
    let kind: String?
    let multiSelect: Bool?
    let options: [Opcao]?
}

/// Pedido completo (de `permissions[]` no detalhe da sessão).
struct Pedido: Codable, Hashable {
    let id: String
    let kind: String?
    let tool: String?
    let toolName: String?
    let preview: String?
    let questions: [Pergunta]?

    var tipo: TipoPedido { TipoPedido(rawValue: kind ?? "") ?? .permissao }

    /// Pergunta única, de escolha única e com opções: dá para responder com botões no widget.
    var perguntaSimples: Pergunta? {
        guard tipo == .pergunta, let lista = questions, lista.count == 1, let unica = lista.first,
              (unica.kind ?? "choice") == "choice", unica.multiSelect != true,
              let opcoes = unica.options, !opcoes.isEmpty else { return nil }
        return unica
    }
}

enum TipoPedido: String {
    case permissao = "permission"
    case plano = "plan"
    case pergunta = "question"
}

struct Snapshot: Codable {
    let now: Double
    let version: String?
    let sessions: [Sessao]
}

struct DetalheSessao: Codable {
    let id: String
    let permissions: [Pedido]?
}

/// Resposta do servidor: `{ success, data, error }`.
struct Envelope<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: String?
}

/// Resultado de uma decisão tomada pelo widget, para ele mostrar o que aconteceu.
struct Aviso: Codable, Hashable {
    let texto: String
    let ok: Bool
    let em: Date
}

/// O que o app hospedeiro grava em `estado.json`. Não tem token.
struct EstadoCompartilhado: Codable {
    var atualizadoEm: Date
    var conectado: Bool
    var erro: String?
    /// Relógio do servidor menos o do Mac, em ms (o servidor manda `now`).
    var desvioRelogio: Double
    var sessoes: [Sessao]
    /// Pedido completo por id de sessão.
    var pedidos: [String: Pedido]
    /// Último resultado por id de pedido.
    var avisos: [String: Aviso]

    static let vazio = EstadoCompartilhado(
        atualizadoEm: .distantPast, conectado: false, erro: nil, desvioRelogio: 0,
        sessoes: [], pedidos: [:], avisos: [:]
    )
}

/// Decisão que o widget deixa na pasta `decisoes/` para o app hospedeiro enviar ao servidor.
struct Decisao: Codable, Hashable {
    let pedidoId: String
    let sessaoId: String
    /// "allow" ou "deny".
    let decisao: String
    let pergunta: String?
    let opcao: String?
    let criadaEm: Date
}
