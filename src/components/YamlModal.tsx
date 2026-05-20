import { useState, useEffect, useRef, useCallback } from "react";
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
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { yaml } from "@codemirror/lang-yaml";
import { linter } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { load } from "js-yaml";
import type { Diagnostic } from "@codemirror/lint";
import { validateComposeSpec } from "../compose-schema";
import { type ComposeStack, type Snapshot, readComposeFile, saveComposeFile, saveSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot } from "../api";

interface YamlEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  onDiagnosticsChange?: (diagnostics: Diagnostic[]) => void;
}

function YamlEditor({ content, onChange, readOnly = false, onDiagnosticsChange }: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange);

  // Keep callback refs current without recreating the editor
  useEffect(() => {
    onChangeRef.current = onChange;
    onDiagnosticsChangeRef.current = onDiagnosticsChange;
  }, [onChange, onDiagnosticsChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const yamlLinter = linter((view: EditorView) => {
      const diagnostics: Diagnostic[] = [];
      let parsed: unknown;

      try {
        parsed = load(view.state.doc.toString());
      } catch (err) {
        const error = err as { mark?: { line: number; column: number }; message: string };
        if (error.mark !== undefined) {
          const line = error.mark.line;
          const col = error.mark.column;
          const lineStart = view.state.doc.line(line + 1).from;
          const lineEnd = view.state.doc.line(line + 1).to;
          diagnostics.push({
            from: Math.max(lineStart, lineStart + col),
            to: Math.min(lineEnd, lineStart + col + 20),
            severity: "error",
            message: error.message || "Invalid YAML",
          });
        }
        onDiagnosticsChangeRef.current?.(diagnostics);
        return diagnostics;
      }

      // Validate against Docker Compose schema
      if (parsed !== null && typeof parsed === 'object') {
        const schemaErrors = validateComposeSpec(parsed);
        if (schemaErrors.length > 0) {
          schemaErrors.forEach(errorMsg => {
            diagnostics.push({
              from: 0,
              to: Math.min(50, view.state.doc.length),
              severity: "warning",
              message: `Docker Compose: ${errorMsg}`,
            });
          });
        }
      }

      onDiagnosticsChangeRef.current?.(diagnostics);
      return diagnostics;
    });

    const extensions: Extension[] = [basicSetup, yaml(), yamlLinter];

    if (readOnly) {
      extensions.push(EditorView.editable.of(false));
    } else {
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      });
      extensions.push(updateListener);
    }

    const isDarkMode = document.documentElement.classList.contains('pf-v6-theme-dark');
    if (isDarkMode) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const editor = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  // content is intentionally omitted: it's only the initial doc value.
  // Callbacks are accessed via refs so they don't trigger recreation either.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Sync externally-driven content changes (e.g. snapshot restore) into the
  // live editor without recreating it. Skips the dispatch when the editor
  // already holds the same text (e.g. after the user just typed a character).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.state.doc.toString() !== content) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: content },
      });
    }
  }, [content]);

  return (
    <div
      ref={containerRef}
      style={{
        border: "1px solid var(--pf-t--global--border--color--default)",
        borderRadius: "var(--pf-t--global--border--radius--200)",
        height: "55vh",
        fontSize: "0.85rem",
      }}
    />
  );
}

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
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const configFile = stack.ConfigFiles.split(",")[0].trim();

  const loadSnapshots = useCallback(async () => {
    try {
      let raw = "";
      const proc = listSnapshots(configFile);
      proc.stream(data => { raw += data; });
      await proc;
      const snapshotPaths = raw.trim().split("\n").filter(Boolean);
      const snapshotList: Snapshot[] = snapshotPaths
        .map(path => {
          const match = path.match(/\.snapshot\.(\d+)$/);
          if (!match) return null;
          const timestamp = parseInt(match[1], 10);
          return {
            timestamp,
            name: new Date(timestamp).toLocaleString(),
            path,
          };
        })
        .filter((s): s is Snapshot => s !== null)
        .sort((a, b) => b.timestamp - a.timestamp);
      setSnapshots(snapshotList);
    } catch {
      // Silently fail if no snapshots exist
      setSnapshots([]);
    }
  }, [configFile]);

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

  const handleEditStart = () => {
    setEditing(true);
  };

  const handleRestoreSnapshot = async (snapshotPath: string) => {
    try {
      const snapshotContent = await restoreSnapshot(snapshotPath);
      setEditedContent(snapshotContent);
      setEditing(true);       // Switch to edit mode so the restored content is visible and saveable
      setShowSnapshots(false);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    }
  };

  const handleDeleteSnapshot = async (snapshotPath: string) => {
    try {
      await deleteSnapshot(snapshotPath);
      await loadSnapshots();
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
                  <Button variant="plain" size="sm" onClick={handleEditStart} icon={<LockIcon />}>
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
