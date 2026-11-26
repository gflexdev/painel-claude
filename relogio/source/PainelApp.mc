import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

// Ponto de entrada (manifest.xml: entry="PainelApp"). O relógio só acompanha: não aprova nem manda nada.
class PainelApp extends Application.AppBase {

    private var _controle as Controle;

    function initialize() {
        AppBase.initialize();
        _controle = new Controle();
    }

    function onStart(state as Dictionary?) as Void {
        _controle.iniciar();
    }

    function onStop(state as Dictionary?) as Void {
        _controle.parar();
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        return [new PainelView(_controle), new PainelDelegate(_controle)];
    }
}
