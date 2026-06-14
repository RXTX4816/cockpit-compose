import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PageSection, Label, Tooltip } from "@patternfly/react-core";
import { composeVersion, dockerVersion, isRootlessMode, getDockerSocketPath, type ComposeVersion } from "../api";
// @ts-expect-error: ESM import assertion for JSON
import pkg from "../../package.json" assert { type: "json" };

export function AppFooter() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<ComposeVersion | null>(null);
  const [dockerVer, setDockerVer] = useState<string | null>(null);

  useEffect(() => {
    let raw = "";
    const proc = composeVersion();
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        try { setVersion(JSON.parse(raw) as ComposeVersion); } catch { /* ignore */ }
      })
      .catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => {
    let raw = "";
    const proc = dockerVersion();
    proc.stream(d => { raw += d; });
    proc
      .then(() => { const v = raw.trim(); if (v) setDockerVer(v); })
      .catch(() => { /* best-effort */ });
  }, []);

  const socketPath = getDockerSocketPath();
  const rootless = isRootlessMode();

  return (
    <PageSection
      variant="default"
      className="cc-footer"
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 1,
        borderTop: "1px solid var(--pf-t--global--border--color--default)",
        padding: "0.5rem 1.5rem",
        fontSize: 13,
        textAlign: "center",
        backgroundColor: "var(--pf-t--global--background--color--primary--default)"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", alignItems: "center" }}>
          {socketPath ? (
            <Tooltip content={socketPath}>
              <Label isCompact color="grey" style={{ cursor: "default" }}>{t("footer.version", { version: pkg.version })}</Label>
            </Tooltip>
          ) : (
            <Label isCompact color="grey">{t("footer.version", { version: pkg.version })}</Label>
          )}
          {dockerVer && (
            <Label isCompact color="blue">{t("footer.docker_version", { version: dockerVer })}</Label>
          )}
          {version && (
            <Label isCompact color="blue">{t("footer.compose_version", { version: version.version })}</Label>
          )}
          {rootless && (
            <Label isCompact color="green">{t("footer.rootless")}</Label>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: 16, justifyContent: "center" }}>
          <a href="https://github.com/RXTX4816/cockpit-compose/wiki" target="_blank" rel="noopener noreferrer" style={{ color: "#0071c1", textDecoration: "none" }}>{t("footer.help")}</a>
          <a href="https://github.com/RXTX4816/cockpit-compose/issues/new/choose" target="_blank" rel="noopener noreferrer" style={{ color: "#0071c1", textDecoration: "none" }}>{t("footer.feedback")}</a>
        </div>
      </div>
    </PageSection>
  );
}
