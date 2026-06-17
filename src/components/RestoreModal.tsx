import { useState, useEffect, useCallback, useRef } from "react";
import { HistoryIcon, SyncAltIcon, TrashIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
  Radio,
  Form,
  FormGroup,
  TextInput,
  Checkbox,
  Spinner,
  ExpandableSection,
} from "@patternfly/react-core";
import { type ComposeStack } from "../api";
import { findComposeFiles, saveComposeFile } from "../api";
import {
  findBackupArchives,
  listArchiveContents,
  readFileFromArchive,
  extractArchive,
  removeFile,
} from "../api/files";
import { type DownedStack } from "../hooks/useDownedStacksScan";

interface Props {
  existingStacks: ComposeStack[];
  defaultScanDir: string;
  onClose: () => void;
  onRestored: (stack: DownedStack) => void;
}

const COMPOSE_PRECEDENCE = new Map(
  ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"].map((n, i) => [n, i]),
);

function parseArchiveRootDir(contents: string): string | null {
  for (const line of contents.trim().split("\n")) {
    const idx = line.indexOf("/");
    if (idx > 0) return line.substring(0, idx);
  }
  return null;
}

function findPrimaryComposeMember(contents: string, rootDir: string): string | null {
  const candidates = contents.trim().split("\n")
    .map(l => l.trim())
    .filter(l => {
      const [dir, file] = l.split("/");
      return dir === rootDir && COMPOSE_PRECEDENCE.has(file);
    });
  candidates.sort((a, b) => {
    const pa = COMPOSE_PRECEDENCE.get(a.split("/")[1]) ?? 99;
    const pb = COMPOSE_PRECEDENCE.get(b.split("/")[1]) ?? 99;
    return pa - pb;
  });
  return candidates[0] ?? null;
}

function parseComposeName(content: string): string | null {
  const m = content.match(/^name:\s+(\S+)/m);
  return m ? m[1] : null;
}

async function checkPathExists(path: string): Promise<boolean> {
  try {
    await cockpit.spawn(["ls", "-d", "--", path], { err: "message" });
    return true;
  } catch {
    return false;
  }
}

export function RestoreModal({ existingStacks, defaultScanDir, onClose, onRestored }: Props) {
  const { t } = useTranslation();

  const [scanDir, setScanDir] = useState(defaultScanDir);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [archives, setArchives] = useState<string[]>([]);
  const [selectedArchive, setSelectedArchive] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPath, setManualPath] = useState("");

  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [detectedRootDir, setDetectedRootDir] = useState<string | null>(null);
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [archiveListing, setArchiveListing] = useState<string | null>(null);

  const [targetDir, setTargetDir] = useState(defaultScanDir);
  const [nameConflict, setNameConflict] = useState(false);
  const [newName, setNewName] = useState("");
  const [targetExists, setTargetExists] = useState(false);
  const [targetExistsConfirmed, setTargetExistsConfirmed] = useState(false);

  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [deletePending, setDeletePending] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const configSectionRef = useRef<HTMLDivElement>(null);
  const prevTargetPathRef = useRef<string | null>(null);

  const runScan = useCallback(async (dir: string) => {
    if (!dir.trim()) return;
    setScanning(true);
    setScanError(null);
    setArchives([]);
    setSelectedArchive(null);
    setDetectedRootDir(null);
    setDetectedName(null);
    setValidationError(null);
    try {
      let output = "";
      const proc = findBackupArchives(dir.trim());
      proc.stream((d: string) => { output += d; });
      await proc;
      const found = output.trim().split("\n").filter(l => l.trim()).sort().reverse();
      setArchives(found);
    } catch (e: unknown) {
      setScanError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
      setHasScanned(true);
    }
  }, []);

  useEffect(() => {
    void runScan(defaultScanDir);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveArchive = selectedArchive ?? (manualOpen && manualPath.trim() ? manualPath.trim() : null);

  const runValidation = useCallback(async (archivePath: string) => {
    setValidating(true);
    setValidationError(null);
    setDetectedRootDir(null);
    setDetectedName(null);
    setArchiveListing(null);
    setNameConflict(false);
    setNewName("");
    setTargetExists(false);
    setTargetExistsConfirmed(false);
    try {
      let listing = "";
      const listProc = listArchiveContents(archivePath);
      listProc.stream((d: string) => { listing += d; });
      await listProc;
      setArchiveListing(listing.trim());

      const rootDir = parseArchiveRootDir(listing);
      if (!rootDir) throw new Error("Could not determine archive root directory");
      setDetectedRootDir(rootDir);

      const composeMember = findPrimaryComposeMember(listing, rootDir);
      let composeName = rootDir;
      if (composeMember) {
        try {
          let content = "";
          const readProc = readFileFromArchive(archivePath, composeMember);
          readProc.stream((d: string) => { content += d; });
          await readProc;
          composeName = parseComposeName(content) ?? rootDir;
        } catch {
          // compose read failed — fall back to dir name
        }
      }
      setDetectedName(composeName);

      const conflict = existingStacks.some(
        s => s.Name.toLowerCase() === composeName.toLowerCase(),
      );
      setNameConflict(conflict);
      if (conflict) setNewName(composeName + "-restored");

      // Check the FINAL destination path (after any rename), not the raw extraction dir.
      // This avoids falsely warning when the extraction dir exists but the rename dest doesn't.
      const defaultFinalName = conflict ? composeName + "-restored" : composeName;
      const targetPath = `${targetDir.replace(/\/$/, "")}/${defaultFinalName}`;
      setTargetExists(await checkPathExists(targetPath));
    } catch (e: unknown) {
      setValidationError(e instanceof Error ? e.message : String(e));
    } finally {
      setValidating(false);
    }
  }, [existingStacks, targetDir]);

  useEffect(() => {
    setTargetExistsConfirmed(false);
    if (effectiveArchive) void runValidation(effectiveArchive);
    else {
      setDetectedRootDir(null);
      setDetectedName(null);
      setValidationError(null);
    }
  }, [effectiveArchive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check target existence whenever the final destination path could have changed.
  // Only reset targetExistsConfirmed when the path itself changes — not on every dep change —
  // to avoid wiping the user's confirmation due to React scheduling the effect after the click.
  useEffect(() => {
    if (!detectedRootDir || !detectedName) return;
    const fn = nameConflict ? (newName.trim() || detectedRootDir) : detectedName;
    const targetPath = `${targetDir.replace(/\/$/, "")}/${fn}`;
    if (targetPath !== prevTargetPathRef.current) {
      prevTargetPathRef.current = targetPath;
      setTargetExistsConfirmed(false);
    }
    void checkPathExists(targetPath).then(setTargetExists);
  }, [targetDir, detectedRootDir, detectedName, nameConflict, newName]);

  useEffect(() => {
    if (!validating) return;
    let parent = configSectionRef.current?.parentElement ?? null;
    while (parent) {
      if (parent.scrollHeight > parent.clientHeight) {
        parent.scrollTo({ top: parent.scrollHeight, behavior: "smooth" });
        return;
      }
      parent = parent.parentElement;
    }
  }, [validating]);

  const finalName = (nameConflict ? newName : detectedName) ?? "";
  const renameNeeded = detectedRootDir !== null && finalName !== detectedRootDir;
  const finalTargetPath = `${targetDir.replace(/\/$/, "")}/${renameNeeded ? finalName : detectedRootDir}`;

  const newNameError = nameConflict && !newName.trim()
    ? t("create_modal.validation_name_required")
    : nameConflict && newName.includes("/")
      ? t("create_modal.validation_name_slashes")
      : null;

  const canRestore = effectiveArchive !== null
    && detectedRootDir !== null
    && !validating
    && !validationError
    && !newNameError
    && (!targetExists || targetExistsConfirmed);

  async function handleRestore() {
    if (!effectiveArchive || !detectedRootDir) return;
    setRestoring(true);
    setRestoreError(null);
    const parent = targetDir.replace(/\/$/, "");
    const extractedPath = `${parent}/${detectedRootDir}`;
    const renamedPath = `${parent}/${finalName}`;
    try {
      if (renameNeeded) {
        // Extract into a temp dir so we never touch parent/detectedRootDir (the live stack folder).
        let tmpOut = "";
        const tmpProc = cockpit.spawn(["mktemp", "-d"], { err: "message" });
        tmpProc.stream((d: string) => { tmpOut += d; });
        await tmpProc;
        const tmpDir = tmpOut.trim();
        try {
          await extractArchive(effectiveArchive, tmpDir);
          const tmpSrc = `${tmpDir}/${detectedRootDir}`;
          if (!await checkPathExists(tmpSrc)) {
            throw new Error(t("restore_modal.error_src_missing", { path: extractedPath }));
          }
          if (await checkPathExists(renamedPath)) {
            throw new Error(t("restore_modal.error_dest_exists", { path: renamedPath }));
          }
          await cockpit.spawn(["mv", "--", tmpSrc, renamedPath], { err: "message" });
        } finally {
          await cockpit.spawn(["rm", "-rf", "--", tmpDir], { err: "message" }).catch(() => {});
        }
      } else {
        await extractArchive(effectiveArchive, parent);
      }

      const finalDir = renameNeeded ? renamedPath : extractedPath;

      if (renameNeeded) {
        let cfOutput = "";
        const cfProc = findComposeFiles(finalDir, 1);
        cfProc.stream((d: string) => { cfOutput += d; });
        await cfProc;
        const composeFiles = cfOutput.trim().split("\n").filter(l => l.trim()).sort((a, b) => {
          const pa = COMPOSE_PRECEDENCE.get(a.split("/").pop() ?? "") ?? 99;
          const pb = COMPOSE_PRECEDENCE.get(b.split("/").pop() ?? "") ?? 99;
          return pa - pb;
        });
        if (composeFiles.length > 0) {
          let content = "";
          const catProc = cockpit.spawn(["cat", "--", composeFiles[0]], { err: "message" });
          catProc.stream((d: string) => { content += d; });
          await catProc;
          if (/^name:\s+\S+/m.test(content)) {
            const updated = content.replace(/^name:\s+\S+/m, `name: ${finalName}`);
            await saveComposeFile(composeFiles[0], updated);
          }
        }
      }

      let cfOutput = "";
      const cfProc = findComposeFiles(finalDir, 1);
      cfProc.stream((d: string) => { cfOutput += d; });
      await cfProc;
      const configFiles = cfOutput.trim().split("\n").filter(l => l.trim());

      onRestored({ name: finalName, configFiles });
      setSuccess(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setRestoreError(msg || (e as { problem?: string }).problem || t("restore_modal.error_unknown"));
    } finally {
      setRestoring(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteConfirming) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeFile(deleteConfirming);
      if (selectedArchive === deleteConfirming) setSelectedArchive(null);
      setDeleteConfirming(null);
      await runScan(scanDir);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }

  function renderDeleteModals() {
    return (
      <>
        {deletePending && (
          <Modal isOpen onClose={() => setDeletePending(null)} variant="small" aria-label={t("restore_modal.delete_backup_confirm1_title")}>
            <ModalHeader title={t("restore_modal.delete_backup_confirm1_title")} />
            <ModalBody>
              <p>{t("restore_modal.delete_backup_confirm1_body", { filename: deletePending.split("/").pop() })}</p>
            </ModalBody>
            <ModalFooter>
              <Button variant="danger" onClick={() => { setDeleteConfirming(deletePending); setDeletePending(null); }}>
                {t("common.delete")}
              </Button>
              <Button variant="link" onClick={() => setDeletePending(null)}>{t("common.cancel")}</Button>
            </ModalFooter>
          </Modal>
        )}
        {deleteConfirming && (
          <Modal isOpen onClose={() => { setDeleteConfirming(null); setDeleteError(null); }} variant="small" aria-label={t("restore_modal.delete_backup_confirm2_title")}>
            <ModalHeader title={t("restore_modal.delete_backup_confirm2_title")} />
            <ModalBody>
              <Alert variant="danger" isInline title={t("restore_modal.delete_backup_confirm2_body")} />
              {deleteError && (
                <Alert variant="danger" isInline title={t("restore_modal.delete_backup_error")} style={{ marginTop: "0.5rem" }}>
                  {deleteError}
                </Alert>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                variant="danger"
                icon={<TrashIcon />}
                isLoading={deleting}
                isDisabled={deleting}
                onClick={() => void handleDeleteConfirmed()}
              >
                {t("common.delete")}
              </Button>
              <Button variant="link" onClick={() => { setDeleteConfirming(null); setDeleteError(null); }} isDisabled={deleting}>
                {t("common.cancel")}
              </Button>
            </ModalFooter>
          </Modal>
        )}
      </>
    );
  }

  return (
    <>
    <Modal isOpen onClose={onClose} variant="medium" aria-label={t("restore_modal.title")}>
      <ModalHeader title={t("restore_modal.title")} />
      <ModalBody>
        {success ? (
          <Alert variant="success" isInline title={t("restore_modal.success_title")} />
        ) : (
          <>
            {/* Phase 1: Archive discovery */}
            <Form>
              <FormGroup label={t("restore_modal.scan_dir_label")} fieldId="rm-scan-dir">
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <TextInput
                    id="rm-scan-dir"
                    value={scanDir}
                    onChange={(_e, v) => setScanDir(v)}
                    isDisabled={scanning || restoring}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="secondary"
                    icon={<SyncAltIcon />}
                    isDisabled={!scanDir.trim() || scanning || restoring}
                    isLoading={scanning}
                    onClick={() => void runScan(scanDir)}
                  >
                    {t("restore_modal.rescan_button")}
                  </Button>
                </div>
              </FormGroup>
            </Form>

            {scanning && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
                <Spinner size="sm" />
                <span>{t("common.scanning")}</span>
              </div>
            )}

            {scanError && (
              <Alert variant="danger" isInline title={scanError} style={{ marginTop: "0.75rem" }} />
            )}

            {!scanning && hasScanned && archives.length === 0 && !scanError && (
              <Alert
                variant="info"
                isInline
                title={t("restore_modal.no_backups_found")}
                style={{ marginTop: "0.75rem" }}
              />
            )}

            {archives.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                {archives.map(path => {
                  const filename = path.split("/").pop() ?? path;
                  return (
                    <div key={path} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <Radio
                        id={`rm-archive-${path}`}
                        name="rm-archive"
                        label={<code>{filename}</code>}
                        value={path}
                        isChecked={selectedArchive === path}
                        onChange={() => { setSelectedArchive(path); setManualOpen(false); }}
                        isDisabled={restoring || deleting}
                        style={{ flex: 1 }}
                      />
                      <Button
                        variant="plain"
                        icon={<TrashIcon />}
                        aria-label={t("restore_modal.delete_backup_button")}
                        isDisabled={restoring || deleting}
                        onClick={() => setDeletePending(path)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <ExpandableSection
              toggleText={t("restore_modal.manual_path_toggle")}
              isExpanded={manualOpen}
              onToggle={(_e, v) => { setManualOpen(v); if (v) setSelectedArchive(null); }}
              style={{ marginTop: "0.5rem" }}
            >
              <FormGroup label={t("restore_modal.manual_path_label")} fieldId="rm-manual-path">
                <TextInput
                  id="rm-manual-path"
                  value={manualPath}
                  onChange={(_e, v) => setManualPath(v)}
                  isDisabled={restoring}
                  placeholder="/path/to/mystack-2026-06-12.bak.tar.gz"
                />
              </FormGroup>
            </ExpandableSection>

            {/* Phase 2: Archive configuration */}
            {(validating || detectedName !== null || validationError !== null) && (
              <div ref={configSectionRef} style={{ marginTop: "1rem", borderTop: "1px solid var(--pf-t--global--border--color--default)", paddingTop: "1rem" }}>
                {validating && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Spinner size="sm" />
                    <span>{t("common.scanning")}</span>
                  </div>
                )}

                {validationError && (
                  <Alert variant="danger" isInline title={validationError} />
                )}

                {!validating && archiveListing !== null && (
                  <ExpandableSection
                    toggleText={t("restore_modal.archive_contents_toggle")}
                    style={{ marginBottom: "0.75rem" }}
                  >
                    <pre style={{ fontSize: "0.8em", maxHeight: "10rem", overflow: "auto", background: "var(--pf-t--global--background--color--secondary--default)", padding: "0.5rem", borderRadius: "3px" }}>
                      {archiveListing}
                    </pre>
                  </ExpandableSection>
                )}

                {!validating && detectedName !== null && (
                  <Form>
                    <FormGroup label={t("restore_modal.detected_name_label")} fieldId="rm-detected-name">
                      <TextInput id="rm-detected-name" value={detectedName} isDisabled readOnly />
                    </FormGroup>

                    {nameConflict && (
                      <>
                        <Alert
                          variant="warning"
                          isInline
                          title={t("restore_modal.name_conflict_warning", { name: detectedName })}
                          style={{ marginBottom: "0.5rem" }}
                        />
                        <FormGroup label={t("restore_modal.new_name_label")} fieldId="rm-new-name">
                          <TextInput
                            id="rm-new-name"
                            value={newName}
                            onChange={(_e, v) => setNewName(v)}
                            validated={newName && newNameError ? "error" : "default"}
                            isDisabled={restoring}
                          />
                          {newName && newNameError && (
                            <div style={{ color: "var(--pf-t--global--color--status--danger--default)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                              {newNameError}
                            </div>
                          )}
                        </FormGroup>
                      </>
                    )}

                    <FormGroup label={t("restore_modal.target_dir_label")} fieldId="rm-target-dir">
                      <TextInput
                        id="rm-target-dir"
                        value={targetDir}
                        onChange={(_e, v) => setTargetDir(v)}
                        isDisabled={restoring}
                      />
                    </FormGroup>

                    {targetExists && (
                      <>
                        <Alert
                          variant="danger"
                          isInline
                          title={t("restore_modal.target_exists_warning", { path: finalTargetPath })}
                        />
                        <Checkbox
                          id="rm-target-confirm"
                          label={t("restore_modal.target_exists_confirm", { path: finalTargetPath })}
                          isChecked={targetExistsConfirmed}
                          onChange={(_e, v) => setTargetExistsConfirmed(v)}
                          isDisabled={restoring}
                          style={{ marginTop: "0.5rem" }}
                        />
                      </>
                    )}
                  </Form>
                )}
              </div>
            )}

            {restoreError && (
              <Alert
                variant="danger"
                isInline
                title={restoreError}
                style={{ marginTop: "0.75rem" }}
              />
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {success ? (
          <Button variant="primary" onClick={onClose}>{t("common.close")}</Button>
        ) : (
          <>
            <Button
              variant="primary"
              icon={<HistoryIcon />}
              isDisabled={!canRestore || restoring}
              isLoading={restoring}
              onClick={() => void handleRestore()}
            >
              {t("restore_modal.restore_button")}
            </Button>
            <Button variant="link" onClick={onClose} isDisabled={restoring}>
              {t("common.cancel")}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
    {renderDeleteModals()}
    </>
  );
}
