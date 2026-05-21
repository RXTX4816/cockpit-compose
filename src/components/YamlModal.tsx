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
import { LockIcon, LockOpenIcon } from "@patternfly/react-icons";
import { load } from "js-yaml";
import type { Diagnostic } from "@codemirror/lint";
import { validateComposeSpec } from "../compose-schema";
import { type ComposeStack, readComposeFile, saveComposeFile, saveSnapshot } from "../api";
import { YamlEditor } from "./YamlEditor";
import { useSnapshots } from "../hooks/useSnapshots";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function YamlModal({ stack, onClose }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [confirmSave, setConfirmSave] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const configFile = stack.ConfigFiles.split(",")[0].trim();
  const { snapshots, load: loadSnapshots, restore, remove } = useSnapshots(configFile);

  useEffect(() => {
    let raw = "";
    const proc = readComposeFile(configFile);
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        setContent(raw);
        setEditedContent(raw);
        setLoading(false);
        void loadSnapshots();
      })
      .catch((ex: unknown) => {
        setError(ex instanceof Error ? ex.message : String(ex));
        setLoading(false);
      });
  }, [configFile, loadSnapshots]);

  const handleRestoreSnapshot = async (snapshotPath: string) => {
    try {
      const snapshotContent = await restore(snapshotPath);
      setEditedContent(snapshotContent);
      setEditing(true);
      setShowSnapshots(false);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    }
  };

  const handleDeleteSnapshot = async (snapshotPath: string) => {
    try {
      await remove(snapshotPath);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    }
  };

  const handleSave = async () => {
    // Run validation synchronously now rather than relying on the async CodeMirror
    // linter state, which may not have fired yet if the user saves quickly after typing.
    const syncDiagnostics: Diagnostic[] = [];
    try {
      const parsed = load(editedContent);
      if (parsed !== null && typeof parsed === "object") {
        validateComposeSpec(parsed).forEach(msg => {
          syncDiagnostics.push({ from: 0, to: 0, severity: "warning", message: `Docker Compose: ${msg}` });
        });
      }
    } catch (err) {
      const e = err as { mark?: { line: number; column: number }; message: string };
      syncDiagnostics.push({ from: 0, to: 0, severity: "error", message: e.message || "Invalid YAML" });
    }

    // Keep the displayed diagnostics in sync so the confirm modal shows correct counts.
    setDiagnostics(syncDiagnostics);

    if (syncDiagnostics.some(d => d.severity === "error" || d.severity === "warning")) {
      setConfirmSave(true);
      return;
    }

    await performSave();
  };

  const performSave = async () => {
    const hasChanges = content !== editedContent;
    if (!hasChanges) {
      setEditing(false);
      setConfirmSave(false);
      return;
    }
    setSaving(true);
    setError(null);
    setConfirmSave(false);
    try {
      await saveSnapshot(configFile, content);
      await saveComposeFile(configFile, editedContent);
      setContent(editedContent);
      setEditing(false);
      await loadSnapshots();
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedContent(content);
    setEditing(false);
  };

  return (
    <>
    <Modal isOpen onClose={onClose} variant="large" aria-label={`Compose file — ${stack.Name}`}>
      <ModalHeader title={`${stack.Name} — compose file`} />
      <ModalBody>
        {!loading && (
          <Toolbar style={{ paddingInline: 0, marginBottom: "0.75rem" }}>
            <ToolbarContent>
              <ToolbarItem>
                <code style={{ fontSize: "var(--pf-t--global--font--size--sm)", color: "var(--pf-t--global--text--color--subtle)" }}>
                  {configFile}
                </code>
              </ToolbarItem>
              <ToolbarItem align={{ default: "alignEnd" }}>
                {snapshots.length > 0 && (
                  <Button variant="plain" size="sm" onClick={() => setShowSnapshots(!showSnapshots)}>
                    History ({snapshots.length})
                  </Button>
                )}
                {!editing ? (
                  <Button variant="plain" size="sm" onClick={() => setEditing(true)} icon={<LockIcon />}>
                    Edit
                  </Button>
                ) : (
                  <Button variant="plain" size="sm" onClick={() => setEditing(false)} icon={<LockOpenIcon />}>
                    Lock
                  </Button>
                )}
              </ToolbarItem>
            </ToolbarContent>
          </Toolbar>
        )}

        {showSnapshots && snapshots.length > 0 && (
          <div style={{ marginBottom: "1rem", padding: "0.75rem", background: "var(--pf-t--global--background--color--secondary--default)", borderRadius: "var(--pf-t--global--border--radius--200)" }}>
            <div style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Snapshots</div>
            {snapshots.map(snap => (
              <div key={snap.timestamp} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem", borderBottom: "1px solid var(--pf-t--global--border--color--default)" }}>
                <span style={{ fontSize: "var(--pf-t--global--font--size--sm)" }}>{snap.name}</span>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button variant="link" size="sm" onClick={() => handleRestoreSnapshot(snap.path)}>Restore</Button>
                  <Button variant="link" size="sm" onClick={() => handleDeleteSnapshot(snap.path)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
            <Spinner />
          </div>
        ) : error && !editing ? (
          <Alert variant="danger" isInline title="Could not read file">{error}</Alert>
        ) : (
          <>
            {error && editing && (
              <Alert variant="danger" isInline title="Save failed" style={{ marginBottom: "1rem" }}>
                {error}
              </Alert>
            )}
            <YamlEditor content={editing ? editedContent : content} onChange={editing ? setEditedContent : () => {}} readOnly={!editing} onDiagnosticsChange={setDiagnostics} />
          </>
        )}
      </ModalBody>
      {editing && (
        <ModalFooter>
          <Button variant="secondary" onClick={handleCancel} isDisabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={saving}>
            Save
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
              There {diagnostics.filter(d => d.severity === "error").length === 1 ? "is" : "are"} {diagnostics.filter(d => d.severity === "error").length} error(s) in your compose file.
            </Alert>
          )}
          {diagnostics.some(d => d.severity === "warning") && (
            <Alert variant="warning" isInline title="Warnings found">
              There {diagnostics.filter(d => d.severity === "warning").length === 1 ? "is" : "are"} {diagnostics.filter(d => d.severity === "warning").length} warning(s) in your compose file.
            </Alert>
          )}
          <p style={{ marginTop: "1rem" }}>Do you want to save anyway?</p>
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
