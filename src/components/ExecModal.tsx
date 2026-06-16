import { useState, useEffect, useRef, useCallback } from "react";
import { TerminalIcon, UnlinkIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  FormGroup,
  TextInput,
  Alert,
} from "@patternfly/react-core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import {
  type ComposeStack,
  readComposeFile,
  getServicesFromCompose,
  compose,
  composeFileSuperuser,
} from "../api";
import "./ExecModal.css";
import { splitConfigFiles } from "../lib/configFiles";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains("pf-v6-theme-dark");
}

function makeXtermTheme(dark: boolean) {
  return dark
    ? { background: "#1e1e1e", foreground: "#d4d4d4", cursor: "#d4d4d4" }
    : { background: "#ffffff", foreground: "#1e1e1e", cursor: "#1e1e1e" };
}

export function ExecModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const configFile = splitConfigFiles(stack.ConfigFiles)[0] ?? "";

  const [services, setServices] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [shell, setShell] = useState("/bin/sh");
  const [user, setUser] = useState("");
  const [step, setStep] = useState<"config" | "terminal">("config");
  const [connectError, setConnectError] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState<number>(() => {
    try { const s = localStorage.getItem("cockpit-compose:exec-font-size"); return s ? Number(s) : 13; } catch { return 13; }
  });

  const termDivRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const channelRef = useRef<CockpitChannel | null>(null);

  // Load services from compose file
  useEffect(() => {
    let raw = "";
    const proc = readComposeFile(configFile);
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        const names = getServicesFromCompose(raw);
        setServices(names);
        if (names.length > 0) setSelectedService(names[0]);
      })
      .catch(() => {
        // services list unavailable — user will type manually
      });
  }, [configFile]);

  // Keep xterm theme in sync with cockpit theme changes
  useEffect(() => {
    const handler = () => {
      if (terminalRef.current) {
        terminalRef.current.options.theme = makeXtermTheme(isDarkMode());
      }
    };
    window.addEventListener("cockpit-style", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("cockpit-style", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const launchTerminal = useCallback(async () => {
    const service = selectedService.trim();
    if (!service) return;

    setConnectError(null);
    setStep("terminal");

    const su = await composeFileSuperuser(splitConfigFiles(stack.ConfigFiles));

    // Defer mounting until the div is in the DOM
    requestAnimationFrame(() => {
      if (!termDivRef.current) return;

      const term = new Terminal({
        cursorBlink: true,
        fontFamily: "monospace",
        fontSize,
        theme: makeXtermTheme(isDarkMode()),
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(termDivRef.current);
      fitAddon.fit();
      terminalRef.current = term;
      fitAddonRef.current = fitAddon;

      const spawnArgs: string[] = compose(
        "-p", stack.Name,
        "-f", configFile,
        "exec",
        ...(user.trim() ? ["-u", user.trim()] : []),
        service,
        ...shell.trim().split(/\s+/).filter(Boolean),
      );

      const ch = cockpit.channel({
        payload: "stream",
        spawn: spawnArgs,
        pty: true,
        superuser: su,
      });
      channelRef.current = ch;

      ch.addEventListener("message", (_e: Event, payload: string) => {
        term.write(payload);
      });

      ch.addEventListener("close", (_e: Event, options: { problem?: string; message?: string }) => {
        const reason = options?.problem ?? options?.message;
        if (reason && reason !== "terminated") {
          setConnectError(reason);
        }
        term.write("\r\n\x1b[90m[Disconnected]\x1b[0m\r\n");
        channelRef.current = null;
      });

      term.onData(data => {
        channelRef.current?.send(data);
      });
    });
  }, [selectedService, shell, user, fontSize, stack.Name, stack.ConfigFiles, configFile]);

  const disconnect = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    terminalRef.current?.dispose();
    terminalRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    disconnect();
    onClose();
  }, [disconnect, onClose]);

  return (
    <Modal
      isOpen
      onClose={handleClose}
      variant="large"
      width="90vw"
      aria-label={t("exec_modal.aria_label", { name: stack.Name })}
    >
      <ModalHeader title={t("exec_modal.title", { name: stack.Name })} />
      <ModalBody>
        {step === "config" && (
          <div className="em2-config-form">
            <FormGroup label={t("exec_modal.field_service")} fieldId="em2-service">
              {services.length > 0 ? (
                <select
                  id="em2-service"
                  className="em2-select"
                  value={selectedService}
                  onChange={e => setSelectedService(e.target.value)}
                >
                  {services.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <TextInput
                  id="em2-service"
                  value={selectedService}
                  onChange={(_e, v) => setSelectedService(v)}
                  placeholder={t("exec_modal.field_service_placeholder")}
                />
              )}
            </FormGroup>

            <FormGroup label={t("exec_modal.field_command")} fieldId="em2-shell">
              <TextInput
                id="em2-shell"
                value={shell}
                onChange={(_e, v) => setShell(v)}
                placeholder={t("exec_modal.field_command_placeholder")}
              />
            </FormGroup>

            <FormGroup label={t("exec_modal.field_user")} fieldId="em2-user">
              <TextInput
                id="em2-user"
                value={user}
                onChange={(_e, v) => setUser(v)}
                placeholder={t("exec_modal.field_user_placeholder")}
              />
            </FormGroup>
          </div>
        )}

        {step === "terminal" && (
          <>
            {connectError && (
              <Alert variant="danger" isInline title={connectError} style={{ marginBottom: "0.5rem" }} />
            )}
            <div className="em2-font-controls" aria-label={t("exec_modal.font_size_label")}>
              <span className="em2-font-label">{t("exec_modal.font_size_label")}</span>
              <button
                type="button"
                className="em2-font-btn"
                onClick={() => {
                  const next = Math.max(8, fontSize - 1);
                  setFontSize(next);
                  localStorage.setItem("cockpit-compose:exec-font-size", String(next));
                  if (terminalRef.current) { terminalRef.current.options.fontSize = next; fitAddonRef.current?.fit(); }
                }}
                aria-label={t("exec_modal.font_size_decrease")}
              >−</button>
              <span className="em2-font-value">{fontSize}px</span>
              <button
                type="button"
                className="em2-font-btn"
                onClick={() => {
                  const next = Math.min(24, fontSize + 1);
                  setFontSize(next);
                  localStorage.setItem("cockpit-compose:exec-font-size", String(next));
                  if (terminalRef.current) { terminalRef.current.options.fontSize = next; fitAddonRef.current?.fit(); }
                }}
                aria-label={t("exec_modal.font_size_increase")}
              >+</button>
            </div>
            <div ref={termDivRef} className="em2-terminal" />
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {step === "config" && (
          <>
            <Button
              variant="primary"
              icon={<TerminalIcon />}
              onClick={() => void launchTerminal()}
              isDisabled={!selectedService.trim()}
            >
              {t("exec_modal.open_shell_button")}
            </Button>
            <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
          </>
        )}
        {step === "terminal" && (
          <Button variant="secondary" icon={<UnlinkIcon />} onClick={handleClose}>{t("exec_modal.disconnect_button")}</Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
