import i18n from "i18next";
import { initReactI18next } from "react-i18next";
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

// Reads Cockpit's language setting in priority order:
// 1. document.documentElement.lang — Cockpit sets this live when the user changes language
// 2. localStorage["cockpit:language"] — Cockpit mirrors the preference here
// 3. Falls back to "en" via fallbackLng
const cockpitDetector = {
  name: "cockpit",
  detect(): string | undefined {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return htmlLang;
    try {
      const stored = localStorage.getItem("cockpit:language");
      if (stored) return stored;
    } catch {
      // localStorage may be unavailable in restricted contexts
    }
    return undefined;
  },
  cacheUserLanguage() {
    // Language is owned by Cockpit settings — never write back
  },
};

void i18n
  .use({ type: "languageDetector", ...cockpitDetector } as Parameters<typeof i18n.use>[0])
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      cs: { translation: cs },
      de: { translation: de },
      es: { translation: es },
      fi: { translation: fi },
      fr: { translation: fr },
      he: { translation: he },
      id: { translation: id },
      it: { translation: it },
      ja: { translation: ja },
      ka: { translation: ka },
      ko: { translation: ko },
      nl: { translation: nl },
      pl: { translation: pl },
      "pt-BR": { translation: ptBR },
      ro: { translation: ro },
      ru: { translation: ru },
      sk: { translation: sk },
      sv: { translation: sv },
      tr: { translation: tr },
      uk: { translation: uk },
      "zh-CN": { translation: zhCN },
      "zh-TW": { translation: zhTW },
    },
    fallbackLng: "en",
    load: "all",
    interpolation: {
      escapeValue: false,
    },
  });

// Cockpit updates document.documentElement.lang when the user switches language at runtime.
// i18next only detects on init, so we observe the attribute and sync the change.
new MutationObserver(() => {
  const lang = document.documentElement.lang;
  if (lang && lang !== i18n.language) {
    void i18n.changeLanguage(lang);
  }
}).observe(document.documentElement, { attributeFilter: ["lang"] });

export { i18n };
