// Imprime o ID da janela principal (layer 0) de um processo, para o screencapture -l.
// Uso: sim-window-id <pid>   (compilado e usado por scripts/screenshot-sim.sh)
import CoreGraphics

guard CommandLine.arguments.count > 1, let pid = Int32(CommandLine.arguments[1]) else {
    print("uso: sim-window-id <pid>")
    exit(2)
}

let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] ?? []
for window in windows where (window[kCGWindowOwnerPID as String] as? Int32) == pid
    && (window[kCGWindowLayer as String] as? Int) == 0 {
    print(window[kCGWindowNumber as String]!)
    break
}
