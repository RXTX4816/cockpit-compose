import { useState, useEffect } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  Alert,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from "@patternfly/react-core";
import type { Diagnostic } from "@codemirror/lint";
import { type ComposeStack, readEnvFile, saveEnvFile } from "../api";
import { EnvEditor } from "./EnvEditor";
import { lintEnvContent } from "./envLint";
import "./YamlModal.css";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function EnvModal({ stack, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existed, setExisted] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [confirmSave, setConfirmSave] = useState(false);

  const configFile = stack.ConfigFiles.split(",")[0].trim();
  const envFile = configFile.substring(0, configFile.lastIndexOf("/") + 1) + ".env";

  useEffect(() => {
    readEnvFile(envFile)
      .then(({ content, exists }) => {
        setEditedContent(content);
        setExisted(exists);
        setLoading(false);
      })
      .catch((ex: unknown) => {
        setError(ex instanceof Error ? ex.message : String(ex));
        setLoading(false);
      });
  }, [envFile]);

  const handleSave = async () => {
    const syncDiagnostics = lintEnvContent(editedContent);
    setDiagnostics(syncDiagnostics);

    if (syncDiagnostics.some(d => d.severity === "error" || d.severity === "warning")) {
      setConfirmSave(true);
      return;
    }

    await performSave();
  };

  const performSave = async () => {
    setSaving(true);
    setError(null);
    setConfirmSave(false);
    try {
      await saveEnvFile(envFile, editedContent);
      onClose();
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
      setSaving(false);
    }
  };

  return (
    <>
    <Modal isOpen onClose={onClose} variant="large" aria-label={`Env file — ${stack.Name}`}>
      <ModalHeader title={`${stack.Name} — env file`} />
      <ModalBody style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="ym-body">
          {!loading && (
            <Toolbar style={{ paddingInline: 0, marginBottom: "0.75rem", flexShrink: 0 }}>
              <ToolbarContent>
                <ToolbarItem>
                  <code className="ym-config-file">{envFile}</code>
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
          )}

          {loading ? (
            <div className="ym-loading">
              <Spinner />
            </div>
          ) : error && !saving ? (
            <Alert variant="danger" isInline title="Could not read file">{error}</Alert>
          ) : (
            <>
              {error && saving && (
                <Alert variant="danger" isInline title="Save failed" style={{ marginBottom: "1rem", flexShrink: 0 }}>
                  {error}
                </Alert>
              )}
              <EnvEditor content={editedContent} onChange={setEditedContent} onDiagnosticsChange={setDiagnostics} />
            </>
          )}
        </div>
      </ModalBody>
      {!loading && (
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} isDisabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={saving}>
            {existed ? "Save" : "Create"}
          </Button>
        </ModalFooter>
      )}
    </Modal>

    {confirmSave && (
      <Modal isOpen variant="small" onClose={() => setConfirmSave(false)} aria-label="Confirm save">
        <ModalHeader title="Save with issues?" />
        <ModalBody>
          {diagnostics.some(d => d.severity === "error") && (
            <Alert variant="danger" isInline title="Errors found" style={{ marginBottom: "1rem" }}>
              There {diagnostics.filter(d => d.severity === "error").length === 1 ? "is" : "are"} {diagnostics.filter(d => d.severity === "error").length} error(s) in your env file.
            </Alert>
          )}
          {diagnostics.some(d => d.severity === "warning") && (
            <Alert variant="warning" isInline title="Warnings found">
              There {diagnostics.filter(d => d.severity === "warning").length === 1 ? "is" : "are"} {diagnostics.filter(d => d.severity === "warning").length} warning(s) in your env file.
            </Alert>
          )}
          <p className="ym-confirm-note">Do you want to save anyway?</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setConfirmSave(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={performSave} isLoading={saving}>
            Save Anyway
          </Button>
        </ModalFooter>
      </Modal>
    )}
    </>
  );
}
