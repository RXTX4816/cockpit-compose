import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem, Alert, Modal, ModalHeader, ModalBody, ModalFooter, Button, Spinner } from "@patternfly/react-core";
import { CubeIcon, SyncAltIcon } from "@patternfly/react-icons";
import {
  setRuntime, detectComposeCommand, getSocketMode, setSocketMode, getSocketAvailability,
  redetectSockets, checkSocketHealth, type Runtime, type SocketMode,
} from "../api";

interface Props {
  onRuntimeChange?: (runtime: Runtime) => void;
  // Fired whenever the effective socket mode changes (explicit toggle click, or a recheck that
  // resolves differently) — the stacks list has no polling of its own, so without this callback
  // the dashboard keeps showing whatever was fetched under the previous mode until some other
  // action happens to trigger a refresh.
  onSocketModeChange?: () => void;
  suggestPodman?: boolean;
}

interface SocketAvailability {
  rootless: boolean;
  rootful: boolean;
  rootfulNeedsAdminAccess: boolean;
}

type SocketHealth = Partial<Record<SocketMode, { ok: boolean; reason?: string }>>;

function DockerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 4 }}>
      <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"/>
    </svg>
  );
}

function PodmanIcon() {
  return <CubeIcon aria-hidden="true" style={{ marginRight: 4, verticalAlign: "middle" }} />;
}

export function RuntimeToggle({ onRuntimeChange, onSocketModeChange, suggestPodman }: Props) {
  const { t } = useTranslation();
  const [runtime, setRuntimeState] = useState<Runtime>(
    () => (localStorage.getItem("cockpit-compose:runtime") ?? "docker") as Runtime,
  );
  const [detecting, setDetecting] = useState(false);
  const [notInstalled, setNotInstalled] = useState<Runtime | null>(null);
  const [showPodmanConfirm, setShowPodmanConfirm] = useState(() => suggestPodman ?? false);
  const [socketMode, setSocketModeState] = useState<SocketMode | undefined>(() => getSocketMode(runtime));
  const [availability, setAvailability] = useState<SocketAvailability>(() => getSocketAvailability(runtime));
  const [health, setHealth] = useState<SocketHealth>({});
  const [rechecking, setRechecking] = useState(false);

  // Re-sync the socket-mode toggle whenever the active runtime changes (including on mount).
  useEffect(() => {
    setSocketModeState(getSocketMode(runtime));
    setAvailability(getSocketAvailability(runtime));
    setHealth({});
  }, [runtime]);

  const handleSocketModeChange = useCallback((mode: SocketMode) => {
    if (mode === socketMode) return;
    setSocketMode(runtime, mode);
    setSocketModeState(mode);
    onSocketModeChange?.();
  }, [runtime, socketMode, onSocketModeChange]);

  const handleRecheck = useCallback(async () => {
    setRechecking(true);
    await redetectSockets(runtime);
    const avail = getSocketAvailability(runtime);
    setAvailability(avail);
    const results: SocketHealth = {};
    if (avail.rootless) results.rootless = await checkSocketHealth(runtime, "rootless");
    if (avail.rootful) results.rootful = await checkSocketHealth(runtime, "rootful");
    setHealth(results);
    const resolved = getSocketMode(runtime);
    const changed = resolved !== socketMode;
    setSocketModeState(resolved);
    setRechecking(false);
    if (changed) onSocketModeChange?.();
  }, [runtime, socketMode, onSocketModeChange]);

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

  const reasonFor = (mode: SocketMode): string | undefined => {
    if (!availability[mode]) {
      return mode === "rootful" && availability.rootfulNeedsAdminAccess
        ? t("runtime.rootful_needs_admin_access")
        : t("runtime.socket_not_detected");
    }
    const h = health[mode];
    return h && !h.ok ? h.reason : undefined;
  };
  const isModeDisabled = (mode: SocketMode): boolean => !availability[mode] || health[mode]?.ok === false;

  const hasSocketModeToggle = availability.rootless || availability.rootful || availability.rootfulNeedsAdminAccess;
  const noSocketDetected = !detecting && socketMode === undefined;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
        {/* Native `title` attributes instead of the Tooltip component throughout this row: with
            two adjacent ToggleGroups plus per-item tooltips, PatternFly's floating Tooltip
            overlays ended up overlapping sibling buttons and intermittently swallowing clicks. */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} title={t("runtime.toggle_label")}>
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
              onChange={() => { if (runtime !== "podman") setShowPodmanConfirm(true); }}
              isDisabled={detecting}
            />
          </ToggleGroup>
          {hasSocketModeToggle && (
            <>
              <div
                aria-hidden="true"
                style={{ width: 1, alignSelf: "stretch", background: "var(--pf-t--global--border--color--default)" }}
              />
              <ToggleGroup aria-label={t("runtime.socket_mode_toggle_label")} isCompact>
                <span title={reasonFor("rootless") ?? t("runtime.rootless_help")}>
                  <ToggleGroupItem
                    text={t("runtime.rootless")}
                    isSelected={socketMode === "rootless"}
                    isDisabled={isModeDisabled("rootless")}
                    onChange={() => handleSocketModeChange("rootless")}
                  />
                </span>
                <span title={reasonFor("rootful") ?? t("runtime.rootful_help")}>
                  <ToggleGroupItem
                    text={t("runtime.rootful")}
                    isSelected={socketMode === "rootful"}
                    isDisabled={isModeDisabled("rootful")}
                    onChange={() => handleSocketModeChange("rootful")}
                  />
                </span>
              </ToggleGroup>
              <Button
                variant="plain"
                aria-label={t("runtime.recheck_sockets")}
                title={t("runtime.recheck_sockets")}
                onClick={() => void handleRecheck()}
                isDisabled={rechecking}
                style={{ padding: "0.15rem" }}
              >
                {rechecking ? <Spinner size="sm" /> : <SyncAltIcon />}
              </Button>
            </>
          )}
        </div>
        {notInstalled && (
          <Alert
            variant="warning"
            isInline
            isPlain
            title={t("runtime.not_installed", { runtime: runtimeLabel })}
            style={{ fontSize: "0.75rem", padding: "0.1rem 0.25rem" }}
          />
        )}
        {noSocketDetected && (
          <Alert
            variant="warning"
            isInline
            isPlain
            title={
              availability.rootfulNeedsAdminAccess
                ? t("runtime.no_socket_needs_admin_access", { runtime: t(`runtime.${runtime}`) })
                : t("runtime.no_socket_detected", { runtime: t(`runtime.${runtime}`) })
            }
            style={{ fontSize: "0.75rem", padding: "0.1rem 0.25rem", maxWidth: 320, textAlign: "right" }}
          />
        )}
      </div>
      {showPodmanConfirm && (
        <Modal isOpen onClose={() => setShowPodmanConfirm(false)} variant="small" aria-label={t("runtime.podman_confirm_title")}>
          <ModalHeader title={t("runtime.podman_confirm_title")} />
          <ModalBody>
            {suggestPodman && (
              <Alert
                variant="info"
                isInline
                isPlain
                title={t("runtime.podman_suggest_docker_missing")}
                style={{ marginBottom: "0.5rem" }}
              />
            )}
            <Alert variant="warning" isInline isPlain title={t("runtime.podman_confirm_body")} />
          </ModalBody>
          <ModalFooter>
            <Button variant="primary" onClick={() => { setShowPodmanConfirm(false); void handleChange("podman"); }}>
              {t("common.continue")}
            </Button>
            <Button variant="link" onClick={() => setShowPodmanConfirm(false)}>
              {t("common.cancel")}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
