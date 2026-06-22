import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { PageSection, Label } from "@patternfly/react-core";
import { Tooltip } from "@rxtx4816/cockpit-plugin-base-react/components";
import { HelpPopover } from "./HelpPopover";
import { composeVersion, containerVersion, isRootlessMode, getDockerSocketPath, getPodmanSocketPath, type ComposeVersion, type Runtime } from "../api";
// @ts-expect-error: ESM import assertion for JSON
import pkg from "../../package.json" assert { type: "json" };

interface Props {
  runtime: Runtime;
}

export function AppFooter({ runtime }: Props) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<ComposeVersion | null>(null);
  const [dockerVer, setDockerVer] = useState<string | null>(null);

  useEffect(() => {
    setVersion(null);
    let raw = "";
    const proc = composeVersion();
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        try {
          setVersion(JSON.parse(raw) as ComposeVersion);
        } catch {
          // podman-compose outputs plain text e.g. "podman-compose version 1.2.0"
          // followed by podman's own version — match only the podman-compose line.
          const match = raw.match(/podman-compose[^:\n]*[:\s]+(\d[\d.]*)/i);
          if (match) setVersion({ version: match[1] });
        }
      })
      .catch(() => { /* best-effort */ });
  }, [runtime]);

  useEffect(() => {
    setDockerVer(null);
    let raw = "";
    const proc = containerVersion();
    proc.stream(d => { raw += d; });
    proc
      .then(() => { const v = raw.trim(); if (v) setDockerVer(v); })
      .catch(() => { /* best-effort */ });
  }, [runtime]);

  const socketPath = runtime === "podman" ? getPodmanSocketPath() : getDockerSocketPath();
  const rootless = isRootlessMode();
  const runtimeLabel = runtime === "podman" ? "Podman" : "Docker";

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
            <Label isCompact color="blue">{t("footer.docker_version", { version: dockerVer, runtime: runtimeLabel })}</Label>
          )}
          {version && (
            <Label isCompact color="blue">{t("footer.compose_version", { version: version.version, runtime: runtimeLabel })}</Label>
          )}
          {rootless && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
              <Label isCompact color="green">{t("footer.rootless")}</Label>
              <HelpPopover
                header={t("footer.rootless_help_title")}
                body={t("footer.rootless_help_body")}
                aria-label={t("footer.rootless_help_title")}
              />
            </span>
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
