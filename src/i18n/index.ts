import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import de from "./locales/de.json";
import pl from "./locales/pl.json";

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
      de: { translation: de },
      pl: { translation: pl },
    },
    fallbackLng: "en",
    load: "languageOnly",
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
