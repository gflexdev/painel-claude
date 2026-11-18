// Token do servidor do painel: guardado no Keychain do Mac (login), importado de
// ~/.config/painel-claude/config.json na primeira vez ou quando o servidor recusa o guardado.
// Só o app hospedeiro lê o token; o widget nunca vê.
import Foundation
import Security
import os

enum Token {
    private static let servico = "br.com.gflex.painel-claude.mac"
    private static let conta = "token-do-painel"
    private static let log = Logger(subsystem: "br.com.gflex.painel-claude.mac", category: "token")

    static var arquivoConfig: URL {
        Armazem.casaReal.appendingPathComponent(".config/painel-claude/config.json")
    }

    enum Falha: LocalizedError {
        case semConfig
        case semToken

        var errorDescription: String? {
            switch self {
            case .semConfig: return "não achei ~/.config/painel-claude/config.json (o servidor do painel está instalado?)"
            case .semToken: return "o config.json do painel não tem token"
            }
        }
    }

    /// Token do Keychain; se não houver (ou não der para ler sem perguntar), importa do config.json.
    static func carregar() throws -> String {
        if let guardado = lerDoKeychain() { return guardado }
        return try importarDoConfig()
    }

    /// Lê de novo o config.json do servidor e substitui o token guardado.
    @discardableResult
    static func importarDoConfig() throws -> String {
        guard let dados = try? Data(contentsOf: arquivoConfig) else { throw Falha.semConfig }
        guard let objeto = try JSONSerialization.jsonObject(with: dados) as? [String: Any],
              let token = objeto["token"] as? String, !token.isEmpty else { throw Falha.semToken }
        guardarNoKeychain(token)
        return token
    }

    private static func consultaBase() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servico,
            kSecAttrAccount as String: conta,
            // Nunca abrir diálogo do Keychain: se o app mudou de assinatura, cai para o config.json.
            kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail,
        ]
    }

    private static func lerDoKeychain() -> String? {
        var consulta = consultaBase()
        consulta[kSecReturnData as String] = true
        consulta[kSecMatchLimit as String] = kSecMatchLimitOne
        var resultado: AnyObject?
        let situacao = SecItemCopyMatching(consulta as CFDictionary, &resultado)
        guard situacao == errSecSuccess, let dados = resultado as? Data, let texto = String(data: dados, encoding: .utf8),
              !texto.isEmpty else {
            if situacao != errSecItemNotFound { log.notice("Keychain sem acesso (\(situacao)); vou usar o config.json") }
            return nil
        }
        return texto
    }

    private static func guardarNoKeychain(_ token: String) {
        let dados = Data(token.utf8)
        let atualizar = SecItemUpdate(consultaBase() as CFDictionary, [kSecValueData as String: dados] as CFDictionary)
        if atualizar == errSecSuccess { return }
        var novo = consultaBase()
        novo[kSecValueData as String] = dados
        novo[kSecAttrLabel as String] = "Painel Claude (token do servidor local)"
        let adicionar = SecItemAdd(novo as CFDictionary, nil)
        if adicionar != errSecSuccess {
            log.error("não consegui guardar o token no Keychain (\(adicionar)); fica só na memória")
        }
    }
}
