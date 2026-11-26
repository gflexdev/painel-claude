import Toybox.Communications;
import Toybox.Lang;
import Toybox.PersistedContent;

typedef RespostaWeb as Method(code as Number, data as Dictionary or String or PersistedContent.Iterator or Null) as Void;

// Fala com o painel pelo celular: Garmin Connect → Tailscale do celular → tailscale serve no Mac.
// Endereço e token são constantes da build (ADR 0002), nunca properties.
class PainelClient {

    function buscarLista(callback as RespostaWeb) as Void {
        Communications.makeWebRequest(Segredos.URL + "/api/watch", null, {
            :method => Communications.HTTP_REQUEST_METHOD_GET,
            :headers => {"Authorization" => "Bearer " + Segredos.TOKEN},
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, callback);
    }

    // Liga (POST /api/sessions/:id/watch) ou desliga (/unwatch) a vigia de uma sessão. O token do relógio só
    // vale aqui e na lista: o relógio só vigia, não aprova nem responde nada.
    function vigiar(id as String, ligar as Boolean, callback as RespostaWeb) as Void {
        Communications.makeWebRequest(Segredos.URL + "/api/sessions/" + id + (ligar ? "/watch" : "/unwatch"), {}, {
            :method => Communications.HTTP_REQUEST_METHOD_POST,
            :headers => {
                "Authorization" => "Bearer " + Segredos.TOKEN,
                "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON
            },
            :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
        }, callback);
    }
}
