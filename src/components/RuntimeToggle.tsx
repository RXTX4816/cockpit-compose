import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem, Tooltip, Alert } from "@patternfly/react-core";
import { setRuntime, detectComposeCommand, type Runtime } from "../api";

interface Props {
  onRuntimeChange?: (runtime: Runtime) => void;
}

function DockerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 4 }}>
      <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"/>
    </svg>
  );
}

function PodmanIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 4 }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    </svg>
  );
}

export function RuntimeToggle({ onRuntimeChange }: Props) {
  const { t } = useTranslation();
  const [runtime, setRuntimeState] = useState<Runtime>(
    () => (localStorage.getItem("cockpit-compose:runtime") ?? "docker") as Runtime,
  );
  const [detecting, setDetecting] = useState(false);
  const [notInstalled, setNotInstalled] = useState<Runtime | null>(null);

  const handleChange = useCallback(async (newRuntime: Runtime) => {
    if (newRuntime === runtime || detecting) return;
    setNotInstalled(null);
    setDetecting(true);

    const prevRuntime = runtime;
    setRuntime(newRuntime);

    const found = await detectComposeCommand();

    if (!found) {
      // Binary not available — revert to the previous runtime
      setRuntime(prevRuntime);
      localStorage.setItem("cockpit-compose:runtime", prevRuntime);
      setNotInstalled(newRuntime);
      setDetecting(false);
      return;
    }

    localStorage.setItem("cockpit-compose:runtime", newRuntime);
    setRuntimeState(newRuntime);
    setDetecting(false);
    onRuntimeChange?.(newRuntime);
  }, [runtime, detecting, onRuntimeChange]);

  const runtimeLabel = notInstalled === "podman" ? "Podman" : "Docker";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
      <Tooltip content={t("runtime.toggle_label")}>
        <ToggleGroup aria-label={t("runtime.toggle_label")} isCompact>
          <ToggleGroupItem
            text={<><DockerIcon />{t("runtime.docker")}</>}
            isSelected={runtime === "docker"}
            onChange={() => void handleChange("docker")}
            isDisabled={detecting}
          />
          <ToggleGroupItem
            text={<><PodmanIcon />{t("runtime.podman")}</>}
            isSelected={runtime === "podman"}
            onChange={() => void handleChange("podman")}
            isDisabled={detecting}
          />
        </ToggleGroup>
      </Tooltip>
      {notInstalled && (
        <Alert
          variant="warning"
          isInline
          isPlain
          title={t("runtime.not_installed", { runtime: runtimeLabel })}
          style={{ fontSize: "0.75rem", padding: "0.1rem 0.25rem" }}
        />
      )}
    </div>
  );
}
