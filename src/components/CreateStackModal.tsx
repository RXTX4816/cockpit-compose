import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { load } from "js-yaml";
import type { Diagnostic } from "@codemirror/lint";
import { validateComposeSpec } from "../compose-schema";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  FormGroup,
  TextInput,
  Radio,
  Alert,
  InputGroup,
  InputGroupItem,
} from "@patternfly/react-core";
import { type ComposeStack, COMPOSE_TEMPLATES, type ComposeTemplate, makeTempDir, fetchComposeFromGit, removeDirectory, createDirectory } from "../api";
import { type DownedStack } from "../hooks/useDownedStacksScan";
import { inferComposeRoot } from "./DownedStacksSection";
import { composeFileSuperuser } from "../api";
import { YamlEditor } from "./YamlEditor";
import "./CreateStackModal.css";

type Method = "git" | "template" | "manual";
type Step = "setup" | "detail";

interface Props {
  stacks: ComposeStack[];
  onClose: () => void;
  onCreated: (stack: DownedStack) => void;
}

const MANUAL_STUB = `services:
  my-app:
    image: my-app:latest
    ports:
      - "8080:80"
    restart: unless-stopped
`;

function nameValid(name: string, t: TFunction): string | null {
  if (!name.trim()) return t("create_modal.validation_name_required");
  if (/[/\\]/.test(name)) return t("create_modal.validation_name_slashes");
  if (/\s/.test(name)) return t("create_modal.validation_name_spaces");
  return null;
}

export function CreateStackModal({ stacks, onClose, onCreated }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("setup");

  // Step 1 fields
  const [stackName, setStackName] = useState("");
  const [composeDir, setComposeDir] = useState("");
  const [method, setMethod] = useState<Method | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [checkingDir, setCheckingDir] = useState(false);

  // Step 2 — Git URL
  const [gitUrl, setGitUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchedYaml, setFetchedYaml] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  const [editedGitYaml, setEditedGitYaml] = useState("");

  // Step 2 — Template
  const [selectedTemplate, setSelectedTemplate] = useState<ComposeTemplate | null>(null);
  const [templateYaml, setTemplateYaml] = useState("");

  // Step 2 — Manual
  const [manualYaml, setManualYaml] = useState(MANUAL_STUB);

  // Common creation state
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [confirmCreate, setConfirmCreate] = useState(false);

  const nameError = nameValid(stackName, t);
  const canNext = !nameError && composeDir.trim() !== "" && method !== null;

  const handleFindBestMatch = useCallback(() => {
    setComposeDir(inferComposeRoot(stacks));
  }, [stacks]);

  const handleNext = useCallback(async () => {
    setSetupError(null);
    setCheckingDir(true);
    const targetDir = `${composeDir.trim()}/${stackName.trim()}`;
    try {
      // Check if target dir exists and is non-empty
      // cockpit.file on a dir path will fail; use spawn to test
      let lsOutput = "";
      const lsProc = cockpit.spawn(["ls", "-A", "--", targetDir], { err: "message" });
      lsProc.stream((d: string) => { lsOutput += d; });
      await lsProc;
      // Command succeeded → dir exists; check if non-empty
      if (lsOutput.trim() !== "") {
        setSetupError(t("create_modal.error_dir_exists", { dir: targetDir }));
        setCheckingDir(false);
        return;
      }
    } catch {
      // ls failed → dir does not exist, fine to proceed
    }
    setCheckingDir(false);
    setStep("detail");
  }, [composeDir, stackName, t]);

  const handleFetchGit = useCallback(async () => {
    const url = gitUrl.trim();
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        setGitError(t("create_modal.error_git_protocol"));
        return;
      }
    } catch {
      setGitError(t("create_modal.error_git_invalid_url"));
      return;
    }

    setFetching(true);
    setGitError(null);
    setFetchedYaml(null);
    let tmpDir = "";
    try {
      let tmpOut = "";
      const mkProc = makeTempDir();
      mkProc.stream((d: string) => { tmpOut += d; });
      await mkProc;
      tmpDir = tmpOut.trim();

      const cloneProc = fetchComposeFromGit(url, tmpDir);
      await cloneProc;

      // Try to read compose file from repo root
      const candidates = ["docker-compose.yml", "compose.yml", "docker-compose.yaml", "compose.yaml"];
      let yaml: string | null = null;
      for (const candidate of candidates) {
        try {
          const content = await cockpit.file(`${tmpDir}/${candidate}`).read() as string | null;
          if (content !== null) {
            yaml = content;
            break;
          }
        } catch {
          // try next
        }
      }

      if (yaml === null) {
        setGitError(t("create_modal.error_git_no_compose"));
      } else {
        setFetchedYaml(yaml);
        setEditedGitYaml(yaml);
      }
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setGitError(msg || t("create_modal.error_git_clone_failed"));
    } finally {
      if (tmpDir) {
        try { await removeDirectory(tmpDir); } catch { /* best effort */ }
      }
      setFetching(false);
    }
  }, [gitUrl, t]);

  const getYamlToWrite = useCallback((): string => {
    if (method === "git") return editedGitYaml;
    if (method === "template") return templateYaml;
    return manualYaml;
  }, [method, editedGitYaml, templateYaml, manualYaml]);

  const validateYaml = useCallback((yaml: string): Diagnostic[] => {
    const diags: Diagnostic[] = [];
    try {
      const parsed = load(yaml);
      if (parsed !== null && typeof parsed === "object") {
        validateComposeSpec(parsed).forEach(msg => {
          diags.push({ from: 0, to: 0, severity: "warning", message: `Docker Compose: ${msg}` });
        });
      }
    } catch (err) {
      const e = err as { message: string };
      diags.push({ from: 0, to: 0, severity: "error", message: e.message || "Invalid YAML" });
    }
    return diags;
  }, []);

  const performCreate = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    setConfirmCreate(false);
    const stackDir = `${composeDir.trim()}/${stackName.trim()}`;
    const configFile = `${stackDir}/docker-compose.yml`;
    try {
      const su = await composeFileSuperuser(configFile);
      await createDirectory(stackDir, su);
      await cockpit.file(configFile, { superuser: su }).replace(getYamlToWrite());
      onCreated({ name: stackName.trim(), configFile });
      onClose();
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setCreateError(msg || t("create_modal.error_create_failed"));
    } finally {
      setCreating(false);
    }
  }, [composeDir, stackName, getYamlToWrite, onCreated, onClose, t]);

  const handleCreate = useCallback(() => {
    const diags = validateYaml(getYamlToWrite());
    setDiagnostics(diags);
    if (diags.some(d => d.severity === "error" || d.severity === "warning")) {
      setConfirmCreate(true);
      return;
    }
    void performCreate();
  }, [validateYaml, getYamlToWrite, performCreate]);

  const canCreate = !creating && (
    method === "git" ? fetchedYaml !== null :
    method === "template" ? selectedTemplate !== null :
    manualYaml.trim() !== ""
  );

  const errorCount = diagnostics.filter(d => d.severity === "error").length;
  const warningCount = diagnostics.filter(d => d.severity === "warning").length;

  return (
    <>
    <Modal isOpen onClose={onClose} variant="medium" aria-label={t("create_modal.aria_label")}>
      <ModalHeader title={t("create_modal.title")} />
      <ModalBody>
        {step === "setup" && (
          <div className="csm-setup">
            <FormGroup label={t("create_modal.field_name")} isRequired fieldId="csm-name">
              <TextInput
                id="csm-name"
                value={stackName}
                onChange={(_e, v) => setStackName(v)}
                placeholder={t("create_modal.field_name_placeholder")}
                validated={stackName && nameError ? "error" : "default"}
              />
              {stackName && nameError && (
                <div className="csm-field-error">{nameError}</div>
              )}
            </FormGroup>

            <FormGroup label={t("create_modal.field_dir")} isRequired fieldId="csm-dir" className="csm-form-group">
              <div className="csm-dir-row">
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={stacks.length === 0}
                  onClick={handleFindBestMatch}
                  title={t("actions.find_best_match_title")}
                >
                  {t("actions.find_best_match")}
                </Button>
                <InputGroup className="csm-dir-input">
                  <InputGroupItem isFill>
                    <TextInput
                      id="csm-dir"
                      value={composeDir}
                      onChange={(_e, v) => setComposeDir(v)}
                      placeholder={t("create_modal.field_dir_placeholder")}
                      aria-label={t("create_modal.field_dir_aria")}
                    />
                  </InputGroupItem>
                </InputGroup>
              </div>
            </FormGroup>

            <FormGroup label={t("create_modal.field_method")} isRequired fieldId="csm-method" className="csm-form-group">
              <div className="csm-radio-group">
                <Radio
                  id="csm-method-git"
                  name="csm-method"
                  label={t("create_modal.method_git_label")}
                  description={t("create_modal.method_git_description")}
                  isChecked={method === "git"}
                  onChange={() => setMethod("git")}
                />
                <Radio
                  id="csm-method-template"
                  name="csm-method"
                  label={t("create_modal.method_template_label")}
                  description={t("create_modal.method_template_description")}
                  isChecked={method === "template"}
                  onChange={() => setMethod("template")}
                />
                <Radio
                  id="csm-method-manual"
                  name="csm-method"
                  label={t("create_modal.method_manual_label")}
                  description={t("create_modal.method_manual_description")}
                  isChecked={method === "manual"}
                  onChange={() => setMethod("manual")}
                />
              </div>
            </FormGroup>

            <Alert variant="warning" isInline title={t("create_modal.ownership_warning_title")} className="csm-setup-error">
              {t("create_modal.ownership_warning_body")}
            </Alert>

            {setupError && (
              <Alert variant="danger" isInline title={setupError} className="csm-setup-error" />
            )}
          </div>
        )}

        {step === "detail" && method === "git" && (
          <div className="csm-detail">
            <FormGroup label={t("create_modal.field_git_url")} isRequired fieldId="csm-git-url">
              <div className="csm-git-row">
                <TextInput
                  id="csm-git-url"
                  value={gitUrl}
                  onChange={(_e, v) => setGitUrl(v)}
                  placeholder={t("create_modal.field_git_placeholder")}
                  isDisabled={fetching}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={!gitUrl.trim() || fetching}
                  isLoading={fetching}
                  onClick={handleFetchGit}
                >
                  {t("common.fetch")}
                </Button>
              </div>
            </FormGroup>

            {gitError && (
              <Alert variant="danger" isInline title={gitError} className="csm-alert" />
            )}

            {fetchedYaml !== null && (
              <>
                <Alert
                  variant="warning"
                  isInline
                  title={t("create_modal.git_review_title")}
                  className="csm-alert"
                >
                  {t("create_modal.git_review_body")}
                </Alert>
                <div className="csm-editor-wrapper">
                  <YamlEditor content={editedGitYaml} onChange={setEditedGitYaml} />
                </div>
              </>
            )}
          </div>
        )}

        {step === "detail" && method === "template" && (
          <div className="csm-detail">
            <div className="csm-template-grid">
              {COMPOSE_TEMPLATES.map(t_item => (
                <button
                  key={t_item.id}
                  type="button"
                  className={`csm-template-card${selectedTemplate?.id === t_item.id ? " csm-template-card--selected" : ""}`}
                  onClick={() => { setSelectedTemplate(t_item); setTemplateYaml(t_item.yaml); }}
                >
                  <span className="csm-template-name">{t_item.name}</span>
                  <span className="csm-template-desc">{t_item.description}</span>
                </button>
              ))}
            </div>
            {selectedTemplate && (
              <div className="csm-editor-wrapper">
                <YamlEditor content={templateYaml} onChange={setTemplateYaml} />
              </div>
            )}
          </div>
        )}

        {step === "detail" && method === "manual" && (
          <div className="csm-detail">
            <div className="csm-editor-wrapper">
              <YamlEditor content={manualYaml} onChange={setManualYaml} />
            </div>
          </div>
        )}

        {createError && (
          <Alert variant="danger" isInline title={createError} className="csm-alert" />
        )}
      </ModalBody>

      <ModalFooter>
        {step === "setup" ? (
          <>
            <Button
              variant="primary"
              isDisabled={!canNext || checkingDir}
              isLoading={checkingDir}
              onClick={() => { void handleNext(); }}
            >
              {t("create_modal.next_button")} →
            </Button>
            <Button variant="link" onClick={onClose}>{t("common.cancel")}</Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              isDisabled={!canCreate}
              isLoading={creating}
              onClick={handleCreate}
            >
              {t("create_modal.create_button")}
            </Button>
            <Button variant="secondary" isDisabled={creating} onClick={() => setStep("setup")}>
              ← {t("common.back")}
            </Button>
            <Button variant="link" isDisabled={creating} onClick={onClose}>{t("common.cancel")}</Button>
          </>
        )}
      </ModalFooter>
    </Modal>

    {confirmCreate && (
      <Modal isOpen variant="small" onClose={() => setConfirmCreate(false)} aria-label={t("create_modal.confirm_create_aria_label")}>
        <ModalHeader title={t("create_modal.confirm_create_title")} />
        <ModalBody>
          {errorCount > 0 && (
            <Alert variant="danger" isInline title={t("create_modal.errors_found_title")} style={{ marginBottom: "1rem" }}>
              {t("create_modal.error_count", { count: errorCount })}
            </Alert>
          )}
          {warningCount > 0 && (
            <Alert variant="warning" isInline title={t("create_modal.warnings_found_title")}>
              {t("create_modal.warning_count", { count: warningCount })}
            </Alert>
          )}
          <p style={{ marginTop: "1rem", fontSize: "0.875rem" }}>{t("create_modal.confirm_create_question")}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setConfirmCreate(false)}>{t("common.cancel")}</Button>
          <Button variant="primary" isLoading={creating} onClick={() => { void performCreate(); }}>
            {t("create_modal.create_anyway_button")}
          </Button>
        </ModalFooter>
      </Modal>
    )}
  </>
  );
}
