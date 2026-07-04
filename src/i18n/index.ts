import { initCockpitI18n, buildLocaleResources } from "@rxtx4816/cockpit-plugin-base-react/i18n";
import en from "./locales/en.json";
import ar from "./locales/ar.json";
import cs from "./locales/cs.json";
import de from "./locales/de.json";
import es from "./locales/es.json";
import fi from "./locales/fi.json";
import fr from "./locales/fr.json";
import he from "./locales/he.json";
import id from "./locales/id.json";
import it from "./locales/it.json";
import ja from "./locales/ja.json";
import ka from "./locales/ka.json";
import ko from "./locales/ko.json";
import nl from "./locales/nl.json";
import pl from "./locales/pl.json";
import ptBR from "./locales/pt-BR.json";
import ro from "./locales/ro.json";
import ru from "./locales/ru.json";
import sk from "./locales/sk.json";
import sv from "./locales/sv.json";
import tr from "./locales/tr.json";
import uk from "./locales/uk.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

initCockpitI18n(
  buildLocaleResources({
    en,
    ar,
    cs,
    de,
    es,
    fi,
    fr,
    he,
    id,
    it,
    ja,
    ka,
    ko,
    nl,
    pl,
    "pt-BR": ptBR,
    ro,
    ru,
    sk,
    sv,
    tr,
    uk,
    "zh-CN": zhCN,
    "zh-TW": zhTW,
  }),
);

export { i18n } from "@rxtx4816/cockpit-plugin-base-react/i18n";
