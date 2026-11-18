// Pasta que o app hospedeiro e o widget dividem: ~/Library/Application Support/PainelClaude.
// O widget roda em sandbox e tem exceção só para esta pasta. O token nunca é gravado aqui.
import Foundation

enum Armazem {
    static let nomePasta = "PainelClaude"
    static let kindWidget = "PainelClaudeWidget"
    /// Uma decisão mais velha que isso é descartada (o pedido já deve ter sido respondido no Mac).
    static let validadeDecisao: TimeInterval = 120

    /// Pasta de casa de verdade (dentro do sandbox, `homeDirectoryForCurrentUser` aponta para o contêiner).
    static var casaReal: URL {
        if let entrada = getpwuid(getuid()), let dir = entrada.pointee.pw_dir {
            return URL(fileURLWithPath: String(cString: dir), isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
    }

    static var pasta: URL {
        casaReal.appendingPathComponent("Library/Application Support/\(nomePasta)", isDirectory: true)
    }
    static var arquivoEstado: URL { pasta.appendingPathComponent("estado.json") }
    static var pastaDecisoes: URL { pasta.appendingPathComponent("decisoes", isDirectory: true) }

    private static func codificador() -> JSONEncoder {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .millisecondsSince1970
        return enc
    }

    private static func decodificador() -> JSONDecoder {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .millisecondsSince1970
        return dec
    }

    static func prepararPastas() throws {
        let fm = FileManager.default
        for dir in [pasta, pastaDecisoes] {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        }
    }

    static func lerEstado() -> EstadoCompartilhado? {
        guard let dados = try? Data(contentsOf: arquivoEstado) else { return nil }
        return try? decodificador().decode(EstadoCompartilhado.self, from: dados)
    }

    static func gravarEstado(_ estado: EstadoCompartilhado) throws {
        try prepararPastas()
        let dados = try codificador().encode(estado)
        try dados.write(to: arquivoEstado, options: [.atomic])
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: arquivoEstado.path)
    }

    /// Grava a decisão com nome único; o app hospedeiro apaga ao enviar.
    @discardableResult
    static func gravarDecisao(_ decisao: Decisao) throws -> URL {
        try prepararPastas()
        let nome = "\(Int(decisao.criadaEm.timeIntervalSince1970 * 1000))-\(UUID().uuidString).json"
        let url = pastaDecisoes.appendingPathComponent(nome)
        try codificador().encode(decisao).write(to: url, options: [.atomic])
        return url
    }

    /// Decisões ainda não enviadas, da mais velha para a mais nova.
    static func decisoesPendentes() -> [(url: URL, decisao: Decisao)] {
        let fm = FileManager.default
        guard let nomes = try? fm.contentsOfDirectory(at: pastaDecisoes, includingPropertiesForKeys: nil) else { return [] }
        return nomes
            .filter { $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url in
                guard let dados = try? Data(contentsOf: url),
                      let decisao = try? decodificador().decode(Decisao.self, from: dados) else {
                    try? fm.removeItem(at: url)
                    return nil
                }
                return (url, decisao)
            }
    }

    /// Ids dos pedidos que já têm decisão a caminho (o widget mostra "enviando…").
    static func pedidosEnviando() -> Set<String> {
        let agora = Date()
        return Set(decisoesPendentes()
            .filter { agora.timeIntervalSince($0.decisao.criadaEm) < validadeDecisao }
            .map(\.decisao.pedidoId))
    }
}
