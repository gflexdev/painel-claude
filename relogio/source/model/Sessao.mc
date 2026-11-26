import Toybox.Lang;

// Uma sessão em movimento, como chega de GET /api/watch.
// status: "waiting" | "error" | "done" | "working". Tempos em segundos; -1 = sem dado.
class Sessao {
    var id as String;
    var name as String;
    var project as String;
    var status as String;
    var age as Number;
    var machine as String = "";
    var activity as String = "";
    // Pedido que segura a sessão: "permission" | "plan" | "question" ("" = nenhum), a ferramenta e quantos há.
    var askKind as String = "";
    var askTool as String = "";
    var askCount as Number = 0;
    var context as Number = -1;
    var model as String = "";
    var turns as Number = -1;
    var open as Number = -1;

    function initialize(id as String, name as String, project as String, status as String, age as Number) {
        self.id = id;
        self.name = name;
        self.project = project;
        self.status = status;
        self.age = age;
    }
}
