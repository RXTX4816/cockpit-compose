import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  FormGroup,
  TextInput,
  Checkbox,
  Spinner,
  Alert,
} from "@patternfly/react-core";
import {
  type ComposeStack,
  readComposeFile,
  getServicesFromCompose,
  composeRunStream,
  composeFileSuperuser,
} from "../api";
import { stripAnsi, classifyLine, kindColor, type LineEntry } from "../lib/pullParser";
import "./RunModal.css";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function RunModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const configFile = stack.ConfigFiles.split(",")[0].trim();

  const [services, setServices] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [command, setCommand] = useState("");
  const [removeContainer, setRemoveContainer] = useState(true);
  const [step, setStep] = useState<"config" | "running">("config");
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const procRef = useRef<CockpitProcess | null>(null);
  const bufRef = useRef("");
  const logRef = useRef<HTMLDivElement>(null);

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
      .catch(() => {});
  }, [configFile]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const handleRun = useCallback(async () => {
    const service = selectedService.trim();
    const cmd = command.trim();
    if (!service || !cmd) return;

    setStep("running");
    const su = await composeFileSuperuser(configFile);

    const proc = composeRunStream(
      stack.Name, configFile, service,
      cmd.split(/\s+/).filter(Boolean),
      removeContainer, su,
    );
    procRef.current = proc;

    proc.stream(data => {
      const clean = stripAnsi(data);
      bufRef.current += clean;
      const parts = bufRef.current.split("\n");
      bufRef.current = parts.pop() ?? "";
      const newLines: LineEntry[] = parts
        .map(line => line.split("\r").pop() ?? "")
        .filter(line => line.trim() !== "")
        .map(text => ({ text, kind: classifyLine(text) }));
      if (newLines.length > 0) setLines(prev => [...prev, ...newLines]);
    });

    proc
      .then(() => { setDone(true); setFailed(false); procRef.current = null; })
      .catch((ex: unknown) => {
        setDone(true);
        setFailed(true);
        setErrorMsg(ex instanceof Error ? ex.message : String(ex));
        procRef.current = null;
      });
  }, [selectedService, command, removeContainer, stack.Name, configFile]);

  const handleClose = useCallback(() => {
    procRef.current?.close();
    procRef.current = null;
    onClose();
  }, [onClose]);

  return (
    <Modal
      isOpen
      onClose={handleClose}
      variant="medium"
      aria-label={t("run_modal.aria_label", { name: stack.Name })}
    >
      <ModalHeader title={t("run_modal.title", { name: stack.Name })} />
      <ModalBody>
        {step === "config" && (
          <div className="rm-config-form">
            <FormGroup label={t("run_modal.field_service")} fieldId="rm-service">
              {services.length > 0 ? (
                <select
                  id="rm-service"
                  className="rm-select"
                  value={selectedService}
                  onChange={e => setSelectedService(e.target.value)}
                >
                  {services.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <TextInput
                  id="rm-service"
                  value={selectedService}
                  onChange={(_e, v) => setSelectedService(v)}
                  placeholder={t("run_modal.field_service_placeholder")}
                />
              )}
            </FormGroup>

            <FormGroup label={t("run_modal.field_command")} fieldId="rm-command">
              <TextInput
                id="rm-command"
                value={command}
                onChange={(_e, v) => setCommand(v)}
                placeholder={t("run_modal.field_command_placeholder")}
              />
            </FormGroup>

            <Checkbox
              id="rm-remove"
              label={t("run_modal.field_rm")}
              isChecked={removeContainer}
              onChange={(_e, checked) => setRemoveContainer(checked)}
            />
          </div>
        )}

        {step === "running" && (
          <>
            <div className="rm-header">
              {!done && <Spinner size="sm" />}
              {!done && (
                <span className="rm-status-running">
                  {t("run_modal.running", { name: stack.Name })}
                </span>
              )}
              {done && !failed && (
                <span className="rm-status-ok">{t("run_modal.complete")}</span>
              )}
              {done && failed && (
                <span className="rm-status-failed">{t("run_modal.failed")}</span>
              )}
            </div>

            {done && failed && errorMsg && (
              <Alert variant="danger" isInline title={errorMsg} style={{ marginBottom: "0.75rem" }} />
            )}

            <div ref={logRef} className="rm-log-viewer">
              {lines.length === 0 ? (
                <span className="rm-log-empty">{t("run_modal.initializing")}</span>
              ) : (
                lines.map((entry, i) => (
                  <div key={i} style={{ color: kindColor[entry.kind] }}>
                    {entry.text}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {step === "config" && (
          <>
            <Button
              variant="primary"
              onClick={() => void handleRun()}
              isDisabled={!selectedService.trim() || !command.trim()}
            >
              {t("run_modal.run_button")}
            </Button>
            <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
          </>
        )}
        {step === "running" && (
          !done ? (
            <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
          ) : (
            <Button variant="primary" onClick={handleClose}>{t("common.close")}</Button>
          )
        )}
      </ModalFooter>
    </Modal>
  );
}
