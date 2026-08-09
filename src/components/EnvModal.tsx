import { useState, useEffect, useCallback, useRef } from "react";
import { SaveIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  Alert,
  Button,
  Tabs,
  Tab,
  TabTitleText,
  TextInput,
} from "@patternfly/react-core";
import { PlusIcon } from "@patternfly/react-icons";
import { type ComposeStack, readEnvFile, saveEnvFile, findEnvFiles } from "../api";
import { EnvTable } from "./EnvTable";
import { EnvEditor } from "./EnvEditor";
import "./YamlModal.css";
import "./EnvModal.css";
import { splitConfigFiles } from "../lib/configFiles";
import { hasDuplicateEnvKeys } from "../lib/envDuplicates";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

interface FileState {
  content: string;
  exists: boolean;
}

export function EnvModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [envFiles, setEnvFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState<string>("");
  const [fileCache, setFileCache] = useState<Record<string, FileState>>({});
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasDuplicates, setHasDuplicates] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "raw">("table");
  const [addingFile, setAddingFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const newFileInputRef = useRef<HTMLInputElement>(null);

  const configFile = splitConfigFiles(stack.ConfigFiles)[0] ?? "";
  const dir = configFile.substring(0, configFile.lastIndexOf("/"));
  const defaultEnv = dir + "/.env";

  const loadFile = useCallback(async (path: string) => {
    if (fileCache[path] !== undefined) return;
    setLoadingFile(true);
    try {
      const result = await readEnvFile(path);
      setFileCache(prev => ({ ...prev, [path]: result }));
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setLoadingFile(false);
    }
  }, [fileCache]);

  useEffect(() => {
    let raw = "";
    const proc = findEnvFiles(dir);
    proc.stream((data: string) => { raw += data; });
    let firstFile = defaultEnv;
    proc.then(() => {
      const found = raw.split("\n").map(l => l.trim()).filter(Boolean).sort();
      const files = found.length > 0 ? found : [defaultEnv];
      firstFile = files[0];
      setEnvFiles(files);
      setActiveFile(files[0]);
      return readEnvFile(files[0]);
    }).then((result: FileState) => {
      setFileCache({ [firstFile]: result });
      setScanning(false);
    }).catch((ex: unknown) => {
      setError(ex instanceof Error ? ex.message : String(ex));
      setScanning(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Focus the new-file input when the form opens
  useEffect(() => {
    if (addingFile) newFileInputRef.current?.focus();
  }, [addingFile]);

  const handleTabChange = async (_e: unknown, key: string | number) => {
    const path = String(key);
    setActiveFile(path);
    await loadFile(path);
  };

  const handleContentChange = (content: string) => {
    setFileCache(prev => ({
      ...prev,
      [activeFile]: { content, exists: prev[activeFile]?.exists ?? false },
    }));
  };

  const handleAddFile = () => {
    const name = newFileName.trim();
    if (!name) return;
    const path = dir + "/" + name;
    setAddingFile(false);
    setNewFileName("");
    if (envFiles.includes(path)) {
      setActiveFile(path);
      return;
    }
    setEnvFiles(prev => [...prev, path]);
    setFileCache(prev => ({ ...prev, [path]: { content: "", exists: false } }));
    setActiveFile(path);
  };

  const handleSave = async () => {
    // Table mode already tracks this live via EnvTable's onDuplicatesChange,
    // but that callback never runs while Raw mode is active — re-check every
    // file's actual content directly here so a duplicate introduced purely in
    // Raw mode still gets caught (issue #261), not just ones caught while
    // Table mode happened to be mounted.
    const anyDuplicates = hasDuplicates || Object.values(fileCache).some(f => hasDuplicateEnvKeys(f.content));
    if (anyDuplicates) {
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
      for (const [path, state] of Object.entries(fileCache)) {
        await saveEnvFile(path, state.content);
      }
      onClose();
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : String(ex));
      setSaving(false);
    }
  };

  const activeState = fileCache[activeFile];
  const loading = scanning || loadingFile;
  const basename = (path: string) => path.substring(path.lastIndexOf("/") + 1);

  return (
    <>
    <Modal isOpen onClose={onClose} variant="large" aria-label={t("env_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("env_modal.title", { name: stack.Name })} />
      <ModalBody style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="ym-body">
          {loading ? (
            <div className="ym-loading">
              <Spinner />
            </div>
          ) : error && !saving ? (
            <Alert variant="danger" isInline title={t("env_modal.load_failed_title")}>{error}</Alert>
          ) : (
            <>
              {error && saving && (
                <Alert variant="danger" isInline title={t("env_modal.save_failed_title")} style={{ marginBottom: "1rem", flexShrink: 0 }}>
                  {error}
                </Alert>
              )}

              {/* Tab bar + add new file */}
              <div className="env-tab-bar">
                <Tabs activeKey={activeFile} onSelect={handleTabChange}>
                  {envFiles.map(path => (
                    <Tab key={path} eventKey={path} title={<TabTitleText>{basename(path)}</TabTitleText>} />
                  ))}
                </Tabs>
                {addingFile ? (
                  <div className="env-new-file-form">
                    <TextInput
                      ref={newFileInputRef}
                      value={newFileName}
                      onChange={(_e, v) => setNewFileName(v)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleAddFile();
                        if (e.key === "Escape") { setAddingFile(false); setNewFileName(""); }
                      }}
                      placeholder={t("env_modal.new_file_placeholder")}
                      aria-label={t("env_modal.new_file_aria")}
                    />
                    <Button variant="primary" size="sm" onClick={handleAddFile} isDisabled={!newFileName.trim()} aria-label={t("env_modal.create_file_aria")}>
                      {t("common.create")}
                    </Button>
                    <Button variant="plain" onClick={() => { setAddingFile(false); setNewFileName(""); }} aria-label={t("env_modal.cancel_aria")}>
                      ✕
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="plain"
                    aria-label={t("env_modal.add_file_aria")}
                    title={t("env_modal.add_file_title")}
                    onClick={() => setAddingFile(true)}
                  >
                    <PlusIcon />
                  </Button>
                )}
              </div>

              {/* Path + view toggle */}
              <div className="env-toolbar">
                <code className="ym-config-file">{activeFile}</code>
                <div className="env-view-toggle">
                  <Button
                    variant={viewMode === "table" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setViewMode("table")}
                  >
                    {t("env_modal.table_button")}
                  </Button>
                  <Button
                    variant={viewMode === "raw" ? "primary" : "secondary"}
                    size="sm"
                    onClick={() => setViewMode("raw")}
                  >
                    {t("env_modal.raw_button")}
                  </Button>
                </div>
              </div>

              {/* Editor */}
              {activeState && viewMode === "table" && (
                <EnvTable
                  content={activeState.content}
                  onChange={handleContentChange}
                  onDuplicatesChange={setHasDuplicates}
                />
              )}
              {activeState && viewMode === "raw" && (
                <EnvEditor content={activeState.content} onChange={handleContentChange} />
              )}
            </>
          )}
        </div>
      </ModalBody>
      {!loading && (
        <ModalFooter>
          <Button variant="secondary" onClick={onClose} isDisabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" icon={<SaveIcon />} onClick={handleSave} isLoading={saving}>
            {activeState?.exists ? t("common.save") : t("common.create")}
          </Button>
        </ModalFooter>
      )}
    </Modal>

    {confirmSave && (
      <Modal isOpen variant="small" onClose={() => setConfirmSave(false)} aria-label={t("env_modal.confirm_save_aria_label")}>
        <ModalHeader title={t("env_modal.confirm_save_title")} />
        <ModalBody>
          <Alert variant="warning" isInline title={t("env_modal.duplicate_keys_title")}>
            {t("env_modal.duplicate_keys_body")}
          </Alert>
          <p className="ym-confirm-note">{t("env_modal.confirm_save_question")}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setConfirmSave(false)}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" icon={<SaveIcon />} onClick={performSave} isLoading={saving}>
            {t("env_modal.save_anyway_button")}
          </Button>
        </ModalFooter>
      </Modal>
    )}
    </>
  );
}
