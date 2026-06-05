import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import { EnvModal } from "./EnvModal";
import { useSnapshots } from "../hooks/useSnapshots";
import "./YamlModal.css";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function YamlModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [confirmSave, setConfirmSave] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showEnv, setShowEnv] = useState(false);

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

  const errorCount = diagnostics.filter(d => d.severity === "error").length;
  const warningCount = diagnostics.filter(d => d.severity === "warning").length;

  return (
    <>
    <Modal isOpen onClose={onClose} variant="large" aria-label={t("yaml_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("yaml_modal.title", { name: stack.Name })} />
      <ModalBody style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="ym-body">
          {!loading && (
            <Toolbar style={{ paddingInline: 0, marginBottom: "0.75rem", flexShrink: 0 }}>
              <ToolbarContent>
                <ToolbarItem>
                  <code className="ym-config-file">{configFile}</code>
                </ToolbarItem>
                <ToolbarItem align={{ default: "alignEnd" }}>
                  <Button variant="plain" size="sm" onClick={() => setShowEnv(true)}>
                    {t("yaml_modal.env_file_button")}
                  </Button>
                  {snapshots.length > 0 && (
                    <Button variant="plain" size="sm" onClick={() => setShowSnapshots(!showSnapshots)}>
                      {t("yaml_modal.history_button", { count: snapshots.length })}
                    </Button>
                  )}
                  {!editing ? (
                    <Button variant="plain" size="sm" onClick={() => setEditing(true)} icon={<LockIcon />}>
                      {t("yaml_modal.edit_button")}
                    </Button>
                  ) : (
                    <Button variant="plain" size="sm" onClick={() => setEditing(false)} icon={<LockOpenIcon />}>
                      {t("yaml_modal.lock_button")}
                    </Button>
                  )}
                </ToolbarItem>
              </ToolbarContent>
            </Toolbar>
          )}

          {showSnapshots && snapshots.length > 0 && (
            <div className="ym-snapshots-panel" style={{ flexShrink: 0 }}>
              <div className="ym-snapshots-title">{t("yaml_modal.snapshots_title")}</div>
              {snapshots.map(snap => (
                <div key={snap.timestamp} className="ym-snapshot-row">
                  <span className="ym-snapshot-name">{snap.name}</span>
                  <div className="ym-snapshot-actions">
                    <Button variant="link" size="sm" onClick={() => handleRestoreSnapshot(snap.path)}>{t("yaml_modal.snapshot_restore")}</Button>
                    <Button variant="link" size="sm" onClick={() => handleDeleteSnapshot(snap.path)}>{t("yaml_modal.snapshot_delete")}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="ym-loading">
              <Spinner />
            </div>
          ) : error && !editing ? (
            <Alert variant="danger" isInline title={t("yaml_modal.load_failed_title")}>{error}</Alert>
          ) : (
            <>
              {error && editing && (
                <Alert variant="danger" isInline title={t("yaml_modal.save_failed_title")} style={{ marginBottom: "1rem", flexShrink: 0 }}>
                  {error}
                </Alert>
              )}
              <YamlEditor content={editing ? editedContent : content} onChange={editing ? setEditedContent : () => {}} readOnly={!editing} onDiagnosticsChange={setDiagnostics} />
            </>
          )}
        </div>
      </ModalBody>
      {editing && (
        <ModalFooter>
          <Button variant="secondary" onClick={handleCancel} isDisabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={saving}>
            {t("common.save")}
          </Button>
        </ModalFooter>
      )}
    </Modal>

    {showEnv && <EnvModal stack={stack} onClose={() => setShowEnv(false)} />}

    {confirmSave && (
      <Modal isOpen variant="small" onClose={() => setConfirmSave(false)} aria-label={t("yaml_modal.confirm_save_aria_label")}>
        <ModalHeader title={t("yaml_modal.confirm_save_title")} />
        <ModalBody>
          {errorCount > 0 && (
            <Alert variant="danger" isInline title={t("yaml_modal.errors_found_title")} style={{ marginBottom: "1rem" }}>
              {t("yaml_modal.error_count", { count: errorCount })}
            </Alert>
          )}
          {warningCount > 0 && (
            <Alert variant="warning" isInline title={t("yaml_modal.warnings_found_title")}>
              {t("yaml_modal.warning_count", { count: warningCount })}
            </Alert>
          )}
          <p className="ym-confirm-note">{t("yaml_modal.confirm_save_question")}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setConfirmSave(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={performSave} isLoading={saving}>
            {t("yaml_modal.save_anyway_button")}
          </Button>
        </ModalFooter>
      </Modal>
    )}
    </>
  );
}
