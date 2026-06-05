import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PageSection } from "@patternfly/react-core";
import { composeVersion, type ComposeVersion } from "../api";
// @ts-expect-error: ESM import assertion for JSON
import pkg from "../../package.json" assert { type: "json" };

export function AppFooter() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<ComposeVersion | null>(null);

  useEffect(() => {
    let raw = "";
    const proc = composeVersion();
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        try {
          setVersion(JSON.parse(raw) as ComposeVersion);
        } catch {
          // ignore parse errors
        }
      })
      .catch(() => {
        // version is best-effort — don't show an error
      });
  }, []);

  return (
    <PageSection
      variant="default"
      className="cc-footer"
      style={{
        borderTop: "1px solid",
        padding: "0.5rem 1.5rem",
        fontSize: 13,
        marginTop: "2.5rem",
        textAlign: "center"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <span style={{ marginBottom: 2 }}>
          {t("footer.version", { version: pkg.version })}
          {version && (
            <span style={{ marginLeft: 12, color: "var(--pf-t--global--text--color--subtle)" }}>
              | {t("footer.compose_version", { version: version.version })}
            </span>
          )}
        </span>
        <div style={{ display: "flex", flexDirection: "row", gap: 16, justifyContent: "center" }}>
          <a href="https://github.com/RXTX4816/cockpit-compose/wiki" target="_blank" rel="noopener noreferrer" style={{ color: "#0071c1", textDecoration: "none" }}>{t("footer.help")}</a>
          <a href="https://github.com/RXTX4816/cockpit-compose/issues/new/choose" target="_blank" rel="noopener noreferrer" style={{ color: "#0071c1", textDecoration: "none" }}>{t("footer.feedback")}</a>
        </div>
      </div>
    </PageSection>
  );
}
