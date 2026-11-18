// Conversa com o servidor do painel em http://127.0.0.1:7777. Token só no cabeçalho Authorization.
import Foundation

struct ErroServidor: LocalizedError {
    let status: Int
    let mensagem: String

    var errorDescription: String? { mensagem }
}

struct Cliente {
    static let base = URL(string: "http://127.0.0.1:7777")!
    static let painelWeb = base

    let token: String

    private static let sessaoCurta: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        return URLSession(configuration: config)
    }()

    /// O servidor manda ping a cada 25 s; 70 s sem nada = conexão morta.
    private static let sessaoStream: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 70
        config.timeoutIntervalForResource = .infinity
        return URLSession(configuration: config)
    }()

    private func pedido(_ caminho: String, metodo: String = "GET", corpo: Data? = nil) -> URLRequest {
        var req = URLRequest(url: Self.base.appendingPathComponent(caminho))
        req.httpMethod = metodo
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let corpo {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = corpo
        }
        return req
    }

    private func enviar<T: Decodable>(_ req: URLRequest, como: T.Type) async throws -> T {
        let (dados, resposta) = try await Self.sessaoCurta.data(for: req)
        let status = (resposta as? HTTPURLResponse)?.statusCode ?? 0
        let envelope = try? JSONDecoder().decode(Envelope<T>.self, from: dados)
        guard (200..<300).contains(status), let envelope, envelope.success, let valor = envelope.data else {
            throw ErroServidor(status: status, mensagem: envelope?.error ?? "HTTP \(status)")
        }
        return valor
    }

    func detalhe(sessao id: String) async throws -> DetalheSessao {
        try await enviar(pedido("api/sessions/\(id)"), como: DetalheSessao.self)
    }

    private struct CorpoDecisao: Encodable {
        let decision: String
        let answers: [String: String]?
    }

    private struct Nada: Decodable {}

    func decidir(pedido id: String, decisao: String, respostas: [String: String]?) async throws {
        let corpo = try JSONEncoder().encode(CorpoDecisao(decision: decisao, answers: respostas))
        let req = pedido("api/permissions/\(id)", metodo: "POST", corpo: corpo)
        let (dados, resposta) = try await Self.sessaoCurta.data(for: req)
        let status = (resposta as? HTTPURLResponse)?.statusCode ?? 0
        if (200..<300).contains(status) { return }
        let erro = (try? JSONSerialization.jsonObject(with: dados) as? [String: Any])?["error"] as? String
        throw ErroServidor(status: status, mensagem: erro ?? "HTTP \(status)")
    }

    /// SSE de `/api/stream`: devolve cada `snapshot` decodificado.
    func stream() -> AsyncThrowingStream<Snapshot, Error> {
        let req = pedido("api/stream")
        return AsyncThrowingStream { continuacao in
            let tarefa = Task {
                do {
                    let (bytes, resposta) = try await Self.sessaoStream.bytes(for: req)
                    let status = (resposta as? HTTPURLResponse)?.statusCode ?? 0
                    guard status == 200 else { throw ErroServidor(status: status, mensagem: "HTTP \(status)") }
                    var evento = ""
                    for try await linha in bytes.lines {
                        if linha.hasPrefix("event:") {
                            evento = linha.dropFirst(6).trimmingCharacters(in: .whitespaces)
                        } else if linha.hasPrefix("data:"), evento == "snapshot" {
                            let json = Data(linha.dropFirst(5).utf8)
                            continuacao.yield(try JSONDecoder().decode(Snapshot.self, from: json))
                            evento = ""
                        }
                    }
                    continuacao.finish(throwing: ErroServidor(status: 0, mensagem: "o servidor fechou o stream"))
                } catch {
                    continuacao.finish(throwing: error)
                }
            }
            continuacao.onTermination = { _ in tarefa.cancel() }
        }
    }
}
