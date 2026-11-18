// Botões do widget. A ação roda no processo do widget (sandbox, sem token): ela só deixa a decisão na
// pasta compartilhada e espera o app hospedeiro enviar ao servidor, para o widget já voltar atualizado.
import AppIntents
import Foundation

struct DecidirPedido: AppIntent {
    static var title: LocalizedStringResource = "Responder pedido do Claude"
    static var description = IntentDescription("Permite, nega ou responde um pedido de uma sessão do Claude Code.")
    static var isDiscoverable = false

    /// Quanto o botão espera o app hospedeiro confirmar o envio antes de devolver o widget.
    private static let esperaMaxima: Duration = .seconds(5)
    private static let passo: Duration = .milliseconds(150)

    @Parameter(title: "Pedido") var pedidoId: String
    @Parameter(title: "Sessão") var sessaoId: String
    @Parameter(title: "Decisão") var decisao: String
    @Parameter(title: "Pergunta") var pergunta: String?
    @Parameter(title: "Opção") var opcao: String?

    init() {}

    init(pedidoId: String, sessaoId: String, decisao: String, pergunta: String? = nil, opcao: String? = nil) {
        self.pedidoId = pedidoId
        self.sessaoId = sessaoId
        self.decisao = decisao
        self.pergunta = pergunta
        self.opcao = opcao
    }

    func perform() async throws -> some IntentResult {
        let arquivo = try Armazem.gravarDecisao(Decisao(
            pedidoId: pedidoId, sessaoId: sessaoId, decisao: decisao,
            pergunta: pergunta, opcao: opcao, criadaEm: Date()
        ))
        let relogio = ContinuousClock()
        let limite = relogio.now.advanced(by: Self.esperaMaxima)
        while relogio.now < limite, FileManager.default.fileExists(atPath: arquivo.path) {
            try await Task.sleep(for: Self.passo)
        }
        return .result()
    }
}
