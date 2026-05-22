import { useState, useCallback } from "react";
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

function nameValid(name: string): string | null {
  if (!name.trim()) return "Name is required";
  if (/[/\\]/.test(name)) return "Name must not contain slashes";
  if (/\s/.test(name)) return "Name must not contain spaces";
  return null;
}

export function CreateStackModal({ stacks, onClose, onCreated }: Props) {
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

  const nameError = nameValid(stackName);
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
        setSetupError(`Directory ${targetDir} already exists and is not empty`);
        setCheckingDir(false);
        return;
      }
    } catch {
      // ls failed → dir does not exist, fine to proceed
    }
    setCheckingDir(false);
    setStep("detail");
  }, [composeDir, stackName]);

  const handleFetchGit = useCallback(async () => {
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

      const cloneProc = fetchComposeFromGit(gitUrl.trim(), tmpDir);
      await cloneProc;

      // Try to read compose file from repo root
      const candidates = ["docker-compose.yml", "compose.yml", "docker-compose.yaml", "compose.yaml"];
      let yaml: string | null = null;
      for (const candidate of candidates) {
        try {
          const content = await cockpit.file(`${tmpDir}/${candidate}`, { superuser: "try" }).read() as string | null;
          if (content !== null) {
            yaml = content;
            break;
          }
        } catch {
          // try next
        }
      }

      if (yaml === null) {
        setGitError("No compose file found in repository root (docker-compose.yml or compose.yml)");
      } else {
        setFetchedYaml(yaml);
        setEditedGitYaml(yaml);
      }
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setGitError(msg || "Git clone failed");
    } finally {
      if (tmpDir) {
        try { await removeDirectory(tmpDir); } catch { /* best effort */ }
      }
      setFetching(false);
    }
  }, [gitUrl]);

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
      await createDirectory(stackDir);
      await cockpit.file(configFile, { superuser: "try" }).replace(getYamlToWrite());
      onCreated({ name: stackName.trim(), configFile });
      onClose();
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setCreateError(msg || "Failed to create stack");
    } finally {
      setCreating(false);
    }
  }, [composeDir, stackName, getYamlToWrite, onCreated, onClose]);

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

  return (
    <>
    <Modal isOpen onClose={onClose} variant="medium" aria-label="Create new compose stack">
      <ModalHeader title="Create compose stack" />
      <ModalBody>
        {step === "setup" && (
          <div className="csm-setup">
            <FormGroup label="Stack name" isRequired fieldId="csm-name">
              <TextInput
                id="csm-name"
                value={stackName}
                onChange={(_e, v) => setStackName(v)}
                placeholder="my-stack"
                validated={stackName && nameError ? "error" : "default"}
              />
              {stackName && nameError && (
                <div className="csm-field-error">{nameError}</div>
              )}
            </FormGroup>

            <FormGroup label="Compose root directory" isRequired fieldId="csm-dir" className="csm-form-group">
              <div className="csm-dir-row">
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={stacks.length === 0}
                  onClick={handleFindBestMatch}
                  title="Infer compose root from active stacks"
                >
                  Find best match
                </Button>
                <InputGroup className="csm-dir-input">
                  <InputGroupItem isFill>
                    <TextInput
                      id="csm-dir"
                      value={composeDir}
                      onChange={(_e, v) => setComposeDir(v)}
                      placeholder="/etc/docker/compose"
                      aria-label="Compose root directory"
                    />
                  </InputGroupItem>
                </InputGroup>
              </div>
            </FormGroup>

            <FormGroup label="Creation method" isRequired fieldId="csm-method" className="csm-form-group">
              <div className="csm-radio-group">
                <Radio
                  id="csm-method-git"
                  name="csm-method"
                  label="From Git URL"
                  description="Fetch docker-compose.yml from a Git repository"
                  isChecked={method === "git"}
                  onChange={() => setMethod("git")}
                />
                <Radio
                  id="csm-method-template"
                  name="csm-method"
                  label="From template"
                  description="Start from a structural YAML example"
                  isChecked={method === "template"}
                  onChange={() => setMethod("template")}
                />
                <Radio
                  id="csm-method-manual"
                  name="csm-method"
                  label="Manual"
                  description="Write the compose file from scratch"
                  isChecked={method === "manual"}
                  onChange={() => setMethod("manual")}
                />
              </div>
            </FormGroup>

            {setupError && (
              <Alert variant="danger" isInline title={setupError} className="csm-setup-error" />
            )}
          </div>
        )}

        {step === "detail" && method === "git" && (
          <div className="csm-detail">
            <FormGroup label="Git repository URL" isRequired fieldId="csm-git-url">
              <div className="csm-git-row">
                <TextInput
                  id="csm-git-url"
                  value={gitUrl}
                  onChange={(_e, v) => setGitUrl(v)}
                  placeholder="https://github.com/example/my-stack.git"
                  isDisabled={fetching}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={!gitUrl.trim() || fetching}
                  isLoading={fetching}
                  onClick={handleFetchGit}
                >
                  Fetch
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
                  title="Review before creating"
                  className="csm-alert"
                >
                  Always review compose files from external sources. Only use repositories you trust.
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
              {COMPOSE_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={`csm-template-card${selectedTemplate?.id === t.id ? " csm-template-card--selected" : ""}`}
                  onClick={() => { setSelectedTemplate(t); setTemplateYaml(t.yaml); }}
                >
                  <span className="csm-template-name">{t.name}</span>
                  <span className="csm-template-desc">{t.description}</span>
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
              Next →
            </Button>
            <Button variant="link" onClick={onClose}>Cancel</Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              isDisabled={!canCreate}
              isLoading={creating}
              onClick={handleCreate}
            >
              Create
            </Button>
            <Button variant="secondary" isDisabled={creating} onClick={() => setStep("setup")}>
              ← Back
            </Button>
            <Button variant="link" isDisabled={creating} onClick={onClose}>Cancel</Button>
          </>
        )}
      </ModalFooter>
    </Modal>

    {confirmCreate && (
      <Modal isOpen variant="small" onClose={() => setConfirmCreate(false)} aria-label="Confirm create">
        <ModalHeader title="Create with issues?" />
        <ModalBody>
          {diagnostics.some(d => d.severity === "error") && (
            <Alert variant="danger" isInline title="Errors found" style={{ marginBottom: "1rem" }}>
              There {diagnostics.filter(d => d.severity === "error").length === 1 ? "is" : "are"}{" "}
              {diagnostics.filter(d => d.severity === "error").length} error(s) in the compose file.
            </Alert>
          )}
          {diagnostics.some(d => d.severity === "warning") && (
            <Alert variant="warning" isInline title="Warnings found">
              There {diagnostics.filter(d => d.severity === "warning").length === 1 ? "is" : "are"}{" "}
              {diagnostics.filter(d => d.severity === "warning").length} warning(s) in the compose file.
            </Alert>
          )}
          <p style={{ marginTop: "1rem", fontSize: "0.875rem" }}>Do you want to create anyway?</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setConfirmCreate(false)}>Cancel</Button>
          <Button variant="primary" isLoading={creating} onClick={() => { void performCreate(); }}>
            Create Anyway
          </Button>
        </ModalFooter>
      </Modal>
    )}
  </>
  );
}
