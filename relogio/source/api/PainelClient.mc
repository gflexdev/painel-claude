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
}
