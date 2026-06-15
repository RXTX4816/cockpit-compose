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
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
} from "@patternfly/react-core";
import { LockIcon, LockOpenIcon, SaveIcon, TrashIcon, PlusCircleIcon } from "@patternfly/react-icons";
import { load } from "js-yaml";
import type { Diagnostic } from "@codemirror/lint";
import { validateComposeSpec } from "../compose-schema";
import { type ComposeStack, readComposeFile, saveComposeFile, saveSnapshot, composeFileSuperuser, removeFile, listYamlFilesInDir } from "../api";
import { YamlEditor } from "./YamlEditor";
import { YamlDiffView } from "./YamlDiffView";
import { EnvModal } from "./EnvModal";
import { useSnapshots } from "../hooks/useSnapshots";
import "./YamlModal.css";
import { splitConfigFiles } from "../lib/configFiles";

const ADDITIONAL_STUB = `services:\n  my-service:\n    image: my-image:latest\n`;
const PRIMARY_FILENAMES = new Set(["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]);

interface Props {
  stack: ComposeStack;
  onClose: () => void;
  onFileAdded?: (newPath: string) => void;
  onFileRemoved?: (removedPath: string) => void;
}

export function YamlModal({ stack, onClose, onFileAdded, onFileRemoved }: Props) {
  const { t } = useTranslation();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [confirmSave, setConfirmSave] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [snapshotDiff, setSnapshotDiff] = useState<{ path: string; snapshotContent: string } | null>(null);
  const [loadingDiffPath, setLoadingDiffPath] = useState<string | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showEnv, setShowEnv] = useState(false);

  const [configFiles, setConfigFiles] = useState(
    () => splitConfigFiles(stack.ConfigFiles),
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const configFile = configFiles[activeIdx];
  const stackDir = configFiles[0].slice(0, configFiles[0].lastIndexOf("/"));
  const [addFileOpen, setAddFileOpen] = useState(false);
  const [newFilename, setNewFilename] = useState("");
  const [newFileContent, setNewFileContent] = useState(ADDITIONAL_STUB);
  const [addFileError, setAddFileError] = useState<string | null>(null);
  const [addFileSaving, setAddFileSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteFileSaving, setDeleteFileSaving] = useState(false);
  const [deleteFileError, setDeleteFileError] = useState<string | null>(null);
  const [importFileOpen, setImportFileOpen] = useState(false);
  const [importFileScanning, setImportFileScanning] = useState(false);
  const [availableYamls, setAvailableYamls] = useState<string[]>([]);
  const [importFileSelected, setImportFileSelected] = useState("");
  const [importFileError, setImportFileError] = useState<string | null>(null);
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

  const handleTabSwitch = (idx: number) => {
    if (idx === activeIdx) return;
    setActiveIdx(idx);
    setEditing(false);
    setShowDiff(false);
    setSnapshotDiff(null);
    setShowSnapshots(false);
    setLoading(true);
    setContent("");
    setEditedContent("");
    setError(null);
  };

  const handleRestoreSnapshot = async (snapshotPath: string) => {
    try {
      const snapshotContent = await restore(snapshotPath);
      setEditedContent(snapshotContent);
      setEditing(true);
      setSnapshotDiff(null);
      setShowSnapshots(false);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    }
  };

  const handleSnapshotDiff = async (path: string) => {
    if (snapshotDiff?.path === path) {
      setSnapshotDiff(null);
      return;
    }
    setLoadingDiffPath(path);
    try {
      const snapshotContent = await restore(path);
      setSnapshotDiff({ path, snapshotContent });
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setLoadingDiffPath(null);
    }
  };

  const handleDeleteSnapshot = async (snapshotPath: string) => {
    try {
      await remove(snapshotPath);
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    }
  };

  const handleAddFile = async () => {
    const filename = newFilename.trim();
    if (!filename) { setAddFileError(t("yaml_modal.add_file_name_required")); return; }
    if (/[/\\]/.test(filename)) { setAddFileError(t("yaml_modal.add_file_name_slashes")); return; }
    if (!/\.(yml|yaml)$/.test(filename)) { setAddFileError(t("yaml_modal.add_file_name_extension")); return; }
    const newPath = `${stackDir}/${filename}`;
    if (PRIMARY_FILENAMES.has(filename) || configFiles.includes(newPath)) {
      setAddFileError(t("yaml_modal.add_file_name_duplicate"));
      return;
    }
    setAddFileSaving(true);
    setAddFileError(null);
    try {
      const su = await composeFileSuperuser(configFiles);
      await saveComposeFile(newPath, newFileContent, su);
      const newFiles = [...configFiles, newPath];
      setConfigFiles(newFiles);
      setActiveIdx(newFiles.length - 1);
      setLoading(true);
      setContent("");
      setEditedContent("");
      setError(null);
      setEditing(false);
      setShowDiff(false);
      setSnapshotDiff(null);
      setShowSnapshots(false);
      setAddFileOpen(false);
      setNewFilename("");
      setNewFileContent(ADDITIONAL_STUB);
      onFileAdded?.(newPath);
    } catch (ex: unknown) {
      setAddFileError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setAddFileSaving(false);
    }
  };

  const handleDeleteFile = async () => {
    setDeleteFileSaving(true);
    setDeleteFileError(null);
    const targetPath = configFile;
    try {
      await removeFile(targetPath);
      const newFiles = configFiles.filter(f => f !== targetPath);
      const newIdx = Math.min(activeIdx - 1, newFiles.length - 1);
      setConfigFiles(newFiles);
      setActiveIdx(newIdx);
      setLoading(true);
      setContent("");
      setEditedContent("");
      setError(null);
      setEditing(false);
      setShowDiff(false);
      setSnapshotDiff(null);
      setShowSnapshots(false);
      setDeleteConfirmOpen(false);
      onFileRemoved?.(targetPath);
    } catch (ex: unknown) {
      setDeleteFileError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setDeleteFileSaving(false);
    }
  };

  const handleOpenImport = async () => {
    setImportFileOpen(true);
    setImportFileScanning(true);
    setImportFileError(null);
    setImportFileSelected("");
    setAvailableYamls([]);
    try {
      let raw = "";
      const proc = listYamlFilesInDir(stackDir);
      proc.stream((d: string) => { raw += d; });
      await proc;
      const files = raw.split("\n").map(l => l.trim()).filter(Boolean)
        .filter(f => !configFiles.includes(f))
        .sort();
      setAvailableYamls(files);
      if (files.length > 0) setImportFileSelected(files[0]);
    } catch (ex: unknown) {
      setImportFileError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setImportFileScanning(false);
    }
  };

  const handleImportFile = () => {
    if (!importFileSelected) return;
    const newFiles = [...configFiles, importFileSelected];
    setConfigFiles(newFiles);
    setActiveIdx(newFiles.length - 1);
    setLoading(true);
    setContent("");
    setEditedContent("");
    setError(null);
    setEditing(false);
    setShowDiff(false);
    setSnapshotDiff(null);
    setShowSnapshots(false);
    setImportFileOpen(false);
    onFileAdded?.(importFileSelected);
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
    setShowDiff(false);
  };

  const errorCount = diagnostics.filter(d => d.severity === "error").length;
  const warningCount = diagnostics.filter(d => d.severity === "warning").length;

  return (
    <>
    <Modal isOpen onClose={onClose} variant="large" aria-label={t("yaml_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("yaml_modal.title", { name: stack.Name })} />
      <ModalBody style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="ym-body">
          <div className="ym-tab-bar" role="tablist">
            {configFiles.map((f, i) => {
              const label = f.slice(f.lastIndexOf("/") + 1);
              return (
                <button
                  key={f}
                  role="tab"
                  aria-selected={i === activeIdx}
                  className={`ym-tab${i === activeIdx ? " ym-tab--active" : ""}`}
                  aria-label={t("yaml_modal.file_tab_aria", { name: label })}
                  onClick={() => handleTabSwitch(i)}
                >
                  {label}
                </button>
              );
            })}
            <div className="ym-tab-actions">
              <Button variant="plain" size="sm" onClick={() => { setAddFileOpen(true); setNewFilename(""); setNewFileContent(ADDITIONAL_STUB); setAddFileError(null); }}>
                {t("yaml_modal.add_file_button")}
              </Button>
              <Button variant="plain" size="sm" onClick={() => void handleOpenImport()}>
                {t("yaml_modal.import_file_button")}
              </Button>
            </div>
          </div>

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
                  {activeIdx > 0 && (
                    <Button variant="plain" size="sm" className="ym-delete-file-btn" onClick={() => { setDeleteConfirmOpen(true); setDeleteFileError(null); }}>
                      {t("yaml_modal.delete_file_button")}
                    </Button>
                  )}
                  {snapshots.length > 0 && (
                    <Button variant="plain" size="sm" onClick={() => setShowSnapshots(!showSnapshots)}>
                      {t("yaml_modal.history_button", { count: snapshots.length })}
                    </Button>
                  )}
                  {editing && (
                    <Button
                      variant="plain"
                      size="sm"
                      isDisabled={content === editedContent}
                      onClick={() => setShowDiff(d => !d)}
                    >
                      {showDiff ? t("yaml_modal.hide_diff_button") : t("yaml_modal.show_diff_button")}
                    </Button>
                  )}
                  {!editing ? (
                    <Button variant="plain" size="sm" onClick={() => { setEditing(true); setSnapshotDiff(null); }} icon={<LockIcon />}>
                      {t("yaml_modal.edit_button")}
                    </Button>
                  ) : (
                    <Button variant="plain" size="sm" onClick={() => { setEditing(false); setShowDiff(false); }} icon={<LockOpenIcon />}>
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
                    <Button variant="link" size="sm" isLoading={loadingDiffPath === snap.path} onClick={() => handleSnapshotDiff(snap.path)}>
                      {snapshotDiff?.path === snap.path ? t("yaml_modal.snapshot_hide_diff") : t("yaml_modal.snapshot_show_diff")}
                    </Button>
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
              {editing && showDiff
                ? <YamlDiffView original={content} modified={editedContent} />
                : snapshotDiff
                ? <YamlDiffView key={snapshotDiff.path} original={snapshotDiff.snapshotContent} modified={content} />
                : <YamlEditor content={editing ? editedContent : content} onChange={editing ? setEditedContent : () => {}} readOnly={!editing} onDiagnosticsChange={setDiagnostics} />
              }
            </>
          )}
        </div>
      </ModalBody>
      {editing && (
        <ModalFooter>
          <Button variant="secondary" onClick={handleCancel} isDisabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" icon={<SaveIcon />} onClick={handleSave} isLoading={saving}>
            {t("common.save")}
          </Button>
        </ModalFooter>
      )}
    </Modal>

    {showEnv && <EnvModal stack={stack} onClose={() => setShowEnv(false)} />}

    {importFileOpen && (
      <Modal isOpen variant="small" onClose={() => setImportFileOpen(false)} aria-label={t("yaml_modal.import_file_title")}>
        <ModalHeader title={t("yaml_modal.import_file_title")} />
        <ModalBody>
          {importFileScanning ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
              <Spinner />
            </div>
          ) : availableYamls.length === 0 && !importFileError ? (
            <p>{t("yaml_modal.import_file_none")}</p>
          ) : (
            <FormGroup label={t("yaml_modal.import_file_select_label")} fieldId="ym-import-file">
              <FormSelect id="ym-import-file" value={importFileSelected} onChange={(_, v) => setImportFileSelected(v)}>
                {availableYamls.map(f => (
                  <FormSelectOption key={f} value={f} label={f.slice(f.lastIndexOf("/") + 1)} />
                ))}
              </FormSelect>
            </FormGroup>
          )}
          {importFileError && (
            <Alert variant="danger" isInline title={importFileError} style={{ marginTop: "0.75rem" }} />
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setImportFileOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" isDisabled={!importFileSelected || importFileScanning} onClick={handleImportFile}>
            {t("yaml_modal.import_file_confirm_button")}
          </Button>
        </ModalFooter>
      </Modal>
    )}

    {deleteConfirmOpen && (
      <Modal isOpen variant="small" onClose={() => setDeleteConfirmOpen(false)} aria-label={t("yaml_modal.delete_file_confirm_aria")}>
        <ModalHeader title={t("yaml_modal.delete_file_confirm_title", { filename: configFile.slice(configFile.lastIndexOf("/") + 1) })} />
        <ModalBody>
          <p>{t("yaml_modal.delete_file_confirm_body", { file: configFile })}</p>
          {deleteFileError && (
            <Alert variant="danger" isInline title={deleteFileError} style={{ marginTop: "0.75rem" }} />
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="link" onClick={() => setDeleteConfirmOpen(false)} isDisabled={deleteFileSaving}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" icon={<TrashIcon />} onClick={() => void handleDeleteFile()} isLoading={deleteFileSaving}>
            {t("yaml_modal.delete_file_confirm_button")}
          </Button>
        </ModalFooter>
      </Modal>
    )}

    {addFileOpen && (
      <Modal isOpen variant="medium" onClose={() => setAddFileOpen(false)} aria-label={t("yaml_modal.add_file_title")}>
        <ModalHeader title={t("yaml_modal.add_file_title")} />
        <ModalBody>
          <FormGroup label={t("yaml_modal.add_file_filename_label")} fieldId="ym-new-filename">
            <TextInput
              id="ym-new-filename"
              value={newFilename}
              onChange={(_, v) => { setNewFilename(v); setAddFileError(null); }}
              placeholder={t("yaml_modal.add_file_filename_placeholder")}
            />
          </FormGroup>
          {addFileError && (
            <Alert variant="danger" isInline title={addFileError} style={{ marginTop: "0.5rem" }} />
          )}
          <div style={{ marginTop: "1rem", minHeight: "200px" }}>
            <YamlEditor
              content={newFileContent}
              onChange={setNewFileContent}
              readOnly={false}
              onDiagnosticsChange={() => {}}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setAddFileOpen(false)} isDisabled={addFileSaving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" icon={<PlusCircleIcon />} onClick={() => void handleAddFile()} isLoading={addFileSaving}>
            {t("yaml_modal.add_file_create_button")}
          </Button>
        </ModalFooter>
      </Modal>
    )}

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
          <Button variant="primary" icon={<SaveIcon />} onClick={performSave} isLoading={saving}>
            {t("yaml_modal.save_anyway_button")}
          </Button>
        </ModalFooter>
      </Modal>
    )}
    </>
  );
}
