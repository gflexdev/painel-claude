// App hospedeiro: fica só na barra de menus, escuta o servidor e mantém o widget em dia.
import AppKit
import ServiceManagement
import SwiftUI

@main
struct PainelClaudeApp: App {
    @NSApplicationDelegateAdaptor(Delegado.self) private var delegado

    var body: some Scene {
        MenuBarExtra {
            MenuPainel(sincronizador: delegado.sincronizador)
        } label: {
            RotuloBarra(sincronizador: delegado.sincronizador)
        }
    }
}

@MainActor
final class Delegado: NSObject, NSApplicationDelegate {
    let sincronizador = Sincronizador()

    func applicationDidFinishLaunching(_ notification: Notification) {
        sincronizador.iniciar()
    }

    /// `painelclaude://sessao/<id>` (toque no widget) abre o painel web nessa sessão.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.scheme == "painelclaude" {
            let partes = url.pathComponents.filter { $0 != "/" }
            let id = url.host == "sessao" ? partes.first : nil
            Navegador.abrirPainel(sessao: id)
        }
    }
}

enum Navegador {
    /// O token não vai na URL: o navegador usa o que o painel web já guardou.
    static func abrirPainel(sessao id: String?) {
        var componentes = URLComponents(url: Cliente.painelWeb, resolvingAgainstBaseURL: false)
        if let id, id.allSatisfy({ $0.isHexDigit || $0 == "-" }) {
            componentes?.fragment = "sessao=\(id)"
        }
        if let url = componentes?.url { NSWorkspace.shared.open(url) }
    }
}

private struct RotuloBarra: View {
    @ObservedObject var sincronizador: Sincronizador

    var body: some View {
        let esperando = sincronizador.sessoes.filter { $0.status == "waiting" }.count
        if !sincronizador.conectado {
            Image(systemName: "circle.dashed")
        } else if esperando > 0 {
            Label("\(esperando)", systemImage: "exclamationmark.bubble.fill").labelStyle(.titleAndIcon)
        } else {
            Image(systemName: "square.grid.2x2")
        }
    }
}

private struct MenuPainel: View {
    @ObservedObject var sincronizador: Sincronizador
    @State private var abrirNoLogin = SMAppService.mainApp.status == .enabled

    var body: some View {
        if sincronizador.conectado {
            let esperando = sincronizador.sessoes.filter { $0.status == "waiting" }.count
            Text("Conectado · \(sincronizador.sessoes.count) sessões · \(esperando) esperando você")
        } else {
            Text("Sem conexão com o painel")
            if let erro = sincronizador.erro { Text(erro).font(.caption) }
        }
        Divider()
        Button("Abrir painel web") { Navegador.abrirPainel(sessao: nil) }
        Button("Reimportar token do servidor") { sincronizador.recarregarToken() }
        Toggle("Abrir ao iniciar o Mac", isOn: Binding(
            get: { abrirNoLogin },
            set: { ligar in
                do {
                    if ligar { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
                } catch {
                    NSSound.beep()
                }
                abrirNoLogin = SMAppService.mainApp.status == .enabled
            }
        ))
        Divider()
        Button("Sair do Painel Claude") { NSApplication.shared.terminate(nil) }
    }
}
