import { useState, useEffect, useRef, useCallback } from "react";
import { PlayIcon } from "@patternfly/react-icons";
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
import { LogViewer } from "@rxtx4816/cockpit-plugin-base-react/components";
import {
  type ComposeStack,
  readComposeFile,
  getServicesFromCompose,
  getJobsFromCompose,
  composeIsLimitedBackend,
  composeRunStream,
  stackSuperuser,
  snapshotProjectContainerIds,
  forceRemoveOneoffContainers,
} from "../api";
import { stripAnsi, classifyLine, type LineEntry } from "../lib/pullParser";
import "./RunModal.css";
import { splitConfigFiles } from "../lib/configFiles";
import { tokenizeCommand } from "../lib/commandTokenize";
import { useInputHistory } from "../hooks/useInputHistory";
import { HistoryDatalist } from "./HistoryDatalist";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function RunModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  const configFile = configFiles[0];

  const [services, setServices] = useState<string[]>([]);
  // Jobs (Compose 5.6.0) run through `compose run <job>` like a service. Only those that
  // allow manual triggering, and not on podman-compose, which has no notion of jobs.
  const [jobs, setJobs] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState("");
  const [command, setCommand] = useState("");
  const [removeContainer, setRemoveContainer] = useState(true);
  const [overrideEntrypoint, setOverrideEntrypoint] = useState(false);
  const { history: commandHistory, record: recordCommand } = useInputHistory("run-command");
  const [step, setStep] = useState<"config" | "running">("config");
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [killing, setKilling] = useState(false);
  const [killError, setKillError] = useState<string | null>(null);

  const procRef = useRef<CockpitProcess | null>(null);
  const preRunIdsRef = useRef<Set<string>>(new Set());
  const killedByUserRef = useRef(false);
  const bufRef = useRef("");

  useEffect(() => {
    let raw = "";
    const proc = readComposeFile(configFile);
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        const names = getServicesFromCompose(raw);
        const jobNames = composeIsLimitedBackend()
          ? []
          : getJobsFromCompose(raw).filter(j => j.manual).map(j => j.name);
        setServices(names);
        setJobs(jobNames);
        const first = names[0] ?? jobNames[0];
        if (first) setSelectedService(first);
      })
      .catch(() => {});
  }, [configFile]);

  const isJob = jobs.includes(selectedService.trim());

  const handleRun = useCallback(async () => {
    const service = selectedService.trim();
    const cmd = command.trim();
    // A job may run with no command at all: it then runs the command it declares.
    if (!service || (!cmd && !isJob)) return;

    if (cmd) recordCommand(cmd);
    setStep("running");
    const files = splitConfigFiles(stack.ConfigFiles);
    const [su, preRunIds] = await Promise.all([
      stackSuperuser(files),
      snapshotProjectContainerIds(stack.Name),
    ]);
    preRunIdsRef.current = preRunIds;

    const tokens = cmd ? tokenizeCommand(cmd) : [];
    const proc = composeRunStream(
      stack.Name, files, service,
      overrideEntrypoint && tokens.length > 0 ? { mode: "override", command: tokens } : { mode: "args", command: tokens },
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
        if (!killedByUserRef.current) {
          setFailed(true);
          setErrorMsg(ex instanceof Error ? ex.message : String(ex));
        }
        procRef.current = null;
      });
  }, [selectedService, command, isJob, removeContainer, overrideEntrypoint, stack.Name, stack.ConfigFiles, recordCommand]);

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
            <Alert
              variant="warning"
              isInline
              title={t("run_modal.warning_title")}
              style={{ marginBottom: "1rem" }}
            >
              {t("run_modal.warning_body")}
            </Alert>
            <FormGroup label={t("run_modal.field_service")} fieldId="rm-service">
              {services.length + jobs.length > 0 ? (
                <select
                  id="rm-service"
                  className="rm-select"
                  value={selectedService}
                  onChange={e => setSelectedService(e.target.value)}
                >
                  {jobs.length === 0
                    ? services.map(s => <option key={s} value={s}>{s}</option>)
                    : (
                      <>
                        {services.length > 0 && (
                          <optgroup label={t("run_modal.group_services")}>
                            {services.map(s => <option key={s} value={s}>{s}</option>)}
                          </optgroup>
                        )}
                        <optgroup label={t("run_modal.group_jobs")}>
                          {jobs.map(j => <option key={`job-${j}`} value={j}>{j}</option>)}
                        </optgroup>
                      </>
                    )}
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
                list="rm-command-history"
              />
              <HistoryDatalist id="rm-command-history" history={commandHistory} />
              <div className="rm-command-help">
                {overrideEntrypoint ? t("run_modal.field_command_help_override") : t("run_modal.field_command_help_args")}
                {isJob && <> {t("run_modal.field_command_job_hint")}</>}
              </div>
            </FormGroup>

            <Checkbox
              id="rm-override-entrypoint"
              label={t("run_modal.field_override_entrypoint")}
              isChecked={overrideEntrypoint}
              onChange={(_e, checked) => setOverrideEntrypoint(checked)}
            />

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

            {killError && (
              <Alert variant="danger" isInline title={killError} style={{ marginBottom: "0.75rem" }} />
            )}

            <LogViewer
              lines={lines.map(l => l.text)}
              error={done && failed ? errorMsg : null}
              emptyMessage={t("run_modal.initializing")}
            />
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {step === "config" && (
          <>
            <Button
              variant="primary"
              icon={<PlayIcon />}
              onClick={() => void handleRun()}
              isDisabled={!selectedService.trim() || (!command.trim() && !isJob)}
            >
              {t("run_modal.run_button")}
            </Button>
            <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
          </>
        )}
        {step === "running" && (
          !done ? (
            <>
              <Button
                variant="danger"
                isLoading={killing}
                isDisabled={killing}
                title={t("run_modal.force_kill_tooltip")}
                onClick={() => {
                  setKillError(null);
                  setKilling(true);
                  killedByUserRef.current = true;
                  forceRemoveOneoffContainers(stack.Name, preRunIdsRef.current)
                    .catch((ex: unknown) => {
                      killedByUserRef.current = false;
                      setKillError(ex instanceof Error ? ex.message : String(ex));
                    })
                    .finally(() => setKilling(false));
                }}
              >
                {t("run_modal.force_kill_button")}
              </Button>
              <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
            </>
          ) : (
            <Button variant="primary" onClick={handleClose}>{t("common.close")}</Button>
          )
        )}
      </ModalFooter>
    </Modal>
  );
}
