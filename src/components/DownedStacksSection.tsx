import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  DataList,
  DataListItem,
  DataListItemRow,
  DataListItemCells,
  DataListCell,
  Button,
  Alert,
  Spinner,
  TextInput,
  Tooltip,
} from "@patternfly/react-core";
import { PlusCircleIcon, FolderOpenIcon, AngleUpIcon, HistoryIcon, PencilAltIcon, ArchiveIcon, TrashIcon } from "@patternfly/react-icons";
import { type ComposeStack } from "../api";
import { type DownedStack, useDownedStacksScan } from "../hooks/useDownedStacksScan";
import { UpModal } from "./UpModal";
import { UpConfirmModal } from "./UpConfirmModal";
import { YamlModal } from "./YamlModal";
import { CreateStackModal } from "./CreateStackModal";
import { DeleteStackModal } from "./DeleteStackModal";
import { RestoreModal } from "./RestoreModal";
import { BackupModal } from "./BackupModal";
import "./DownedStacksSection.css";
import { splitConfigFiles } from "../lib/configFiles";

interface Props {
  stacks: ComposeStack[];
  manuallyDownedStacks: DownedStack[];
  onRefresh: () => void;
  onUpComplete: (name: string) => void;
}

export function inferComposeRoot(stacks: ComposeStack[]): string {
  if (stacks.length === 0) return "";
  const tally = new Map<string, number>();
  for (const stack of stacks) {
    const configFile = splitConfigFiles(stack.ConfigFiles)[0] ?? "";
    const stackDir = configFile.slice(0, configFile.lastIndexOf("/"));
    const parent = stackDir.slice(0, stackDir.lastIndexOf("/"));
    if (parent) tally.set(parent, (tally.get(parent) ?? 0) + 1);
  }
  if (tally.size === 0) return "";
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return best[0][0];
}


function toSyntheticStack(d: DownedStack): ComposeStack {
  return { Name: d.name, Status: "", ConfigFiles: d.configFiles.join(",") };
}

export function DownedStacksSection({ stacks, manuallyDownedStacks, onRefresh, onUpComplete }: Props) {
  const { t } = useTranslation();
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [composeDir, setComposeDir] = useState("");
  const [maxDepth, setMaxDepth] = useState(2);
  const [upConfirmTarget, setUpConfirmTarget] = useState<DownedStack | null>(null);
  const [upTarget, setUpTarget] = useState<DownedStack | null>(null);
  const [upTargetProfiles, setUpTargetProfiles] = useState<string[]>([]);
  const [yamlTarget, setYamlTarget] = useState<DownedStack | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DownedStack | null>(null);
  const [configFileOverrides, setConfigFileOverrides] = useState<Record<string, string[]>>({});
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [backupTarget, setBackupTarget] = useState<DownedStack | null>(null);
  const autoDetectedRef = useRef(false);

  const { downedStacks, scanning, hasScanned, error, warning, scan, removeStack, addStack, updateStack }
    = useDownedStacksScan(composeDir, maxDepth, stacks);

  // Merge manually downed + scanned, dedup by name, apply local config file overrides
  const combinedStacks: DownedStack[] = [
    ...manuallyDownedStacks,
    ...downedStacks.filter(d =>
      !manuallyDownedStacks.some(m => m.name.toLowerCase() === d.name.toLowerCase())
    ),
  ].map(d => {
    const override = configFileOverrides[d.name.toLowerCase()];
    return override ? { ...d, configFiles: override } : d;
  });

  // Auto-detect the compose root on first stacks load
  useEffect(() => {
    if (autoDetectedRef.current || stacks.length === 0) return;
    const root = inferComposeRoot(stacks);
    if (root) {
      autoDetectedRef.current = true;
      setComposeDir(root);
    }
  }, [stacks]);

  const handleDirChange = useCallback((_e: unknown, val: string) => {
    setComposeDir(val);
    // do not clear scan results here — they persist until next scan runs
  }, []);

  const handleDepthMinus = useCallback(() => {
    setMaxDepth(prev => Math.max(1, prev - 1));
  }, []);
  const handleDepthPlus = useCallback(() => {
    setMaxDepth(prev => Math.min(5, prev + 1));
  }, []);

  const handleFindBestMatch = useCallback(() => {
    setComposeDir(inferComposeRoot(stacks));
    // do not clear scan results — they persist until user triggers a new scan
  }, [stacks]);

  const handleUpClose = useCallback((name: string, succeeded: boolean) => {
    setUpTarget(null);
    if (succeeded) {
      removeStack(name);
      onUpComplete(name);
      onRefresh();
    }
  }, [removeStack, onUpComplete, onRefresh]);

  const hasContent = scanning || error !== null || combinedStacks.length > 0
    || (hasScanned && combinedStacks.length === 0);

  return (
    <>
      <div className="dss-import-bar">
        <Button
          variant="primary"
          size="sm"
          icon={<PlusCircleIcon />}
          onClick={() => setCreateOpen(true)}
        >
          {t("downed_section.create_button")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={importOpen ? <AngleUpIcon /> : <FolderOpenIcon />}
          onClick={() => setImportOpen(o => !o)}
          aria-expanded={importOpen}
        >
          {t("downed_section.import_button")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<HistoryIcon />}
          onClick={() => setRestoreOpen(true)}
        >
          {t("downed_section.restore_button")}
        </Button>
      </div>

      {importOpen && (
        <div className="dss-controls">
          <div className="dss-search-bar">
            <Button
              variant="secondary"
              isDisabled={stacks.length === 0 || scanning}
              onClick={handleFindBestMatch}
              title={t("actions.find_best_match_title")}
              className="dss-find-btn"
            >
              {t("actions.find_best_match")}
            </Button>
            <TextInput
              className="dss-search-dir"
              aria-label={t("downed_section.dir_aria")}
              placeholder={t("downed_section.dir_placeholder")}
              value={composeDir}
              onChange={handleDirChange}
              isDisabled={scanning}
              onKeyDown={(e) => { if (e.key === "Enter" && composeDir.trim() && !scanning) scan(); }}
            />
            <div className="dss-stepper" aria-disabled={scanning}>
              <span className="dss-stepper-label">{t("downed_section.depth_label")}</span>
              <button
                type="button"
                className="dss-stepper-btn"
                onClick={handleDepthMinus}
                disabled={scanning || maxDepth <= 1}
                aria-label={t("downed_section.depth_minus_aria")}
              >−</button>
              <span
                className="dss-stepper-value"
                aria-live="polite"
                aria-label={t("downed_section.depth_aria")}
              >{maxDepth}</span>
              <button
                type="button"
                className="dss-stepper-btn"
                onClick={handleDepthPlus}
                disabled={scanning || maxDepth >= 5}
                aria-label={t("downed_section.depth_plus_aria")}
              >+</button>
            </div>
            <Button
              variant="primary"
              isDisabled={!composeDir.trim() || scanning}
              isLoading={scanning}
              onClick={scan}
              className="dss-scan-btn"
            >
              {t("common.scan")}
            </Button>
          </div>
          {hasScanned && warning && (
            <span className="dss-scan-warning" title={warning}>
              ⚠ {t("downed_section.scan_partial_warning")}
            </span>
          )}
        </div>
      )}

      {hasContent && (
        <>
          <div className="dss-separator" aria-hidden="true">
            <span className="dss-separator-label">{t("downed_section.down_status")}</span>
          </div>

          {scanning && (
            <div className="dss-list-wrapper dss-scanning">
              <Spinner size="sm" />
              <span>{t("common.scanning")}</span>
            </div>
          )}

          {error && (
            <div className="dss-list-wrapper">
              <Alert variant="danger" isInline title={t("downed_section.scan_failed_title")} className="dss-alert">
                {error}
              </Alert>
            </div>
          )}

          {!scanning && !error && hasScanned && combinedStacks.length === 0 && (
            <div className="dss-list-wrapper">
              <Alert variant="warning" isInline title={t("downed_section.nothing_found_title")} className="dss-alert">
                {t("downed_section.nothing_found_body")}
              </Alert>
            </div>
          )}

          {!scanning && combinedStacks.length > 0 && (
            <div className="dss-list-wrapper">
              <DataList aria-label={t("downed_section.down_stacks_aria")} isCompact className="dss-list">
                {combinedStacks.map(d => (
                  <DataListItem key={d.name} aria-labelledby={`dss-name-${d.name}`} data-status="down">
                    <DataListItemRow>
                      <DataListItemCells
                        dataListCells={[
                          <DataListCell key="name" width={2}>
                            <span id={`dss-name-${d.name}`} className="dss-stack-name">
                              {d.name}
                            </span>
                          </DataListCell>,
                          <DataListCell key="path" width={3}>
                            <span className="dss-path-dir">{d.configFiles[0]?.replace(/\/[^/]+$/, "") ?? ""}</span>
                            {d.configFiles.length > 1 && (
                              <span className="dss-path-files">{d.configFiles.map(f => f.replace(/.*\//, "")).join(" + ")}</span>
                            )}
                          </DataListCell>,
                          <DataListCell key="actions" width={2} className="dss-actions">
                            <Tooltip content={t("actions.up_title")}>
                              <Button variant="primary" size="sm" onClick={() => setUpConfirmTarget(d)}>
                                {t("actions.up")}
                              </Button>
                            </Tooltip>
                            <span className="dss-icon-group">
                              <Tooltip content={t("downed_section.edit_title")}>
                                <Button variant="plain" size="sm" onClick={() => setYamlTarget(d)} aria-label={t("downed_section.edit_title")}>
                                  <PencilAltIcon />
                                </Button>
                              </Tooltip>
                              <Tooltip content={t("actions.backup")}>
                                <Button variant="plain" size="sm" onClick={() => setBackupTarget(d)} aria-label={t("actions.backup")}>
                                  <ArchiveIcon />
                                </Button>
                              </Tooltip>
                              <Tooltip content={t("downed_section.delete_title")}>
                                <Button
                                  variant="plain"
                                  size="sm"
                                  onClick={() => setDeleteTarget(d)}
                                  aria-label={t("downed_section.delete_title")}
                                  className="dss-delete-btn"
                                >
                                  <TrashIcon />
                                </Button>
                              </Tooltip>
                            </span>
                          </DataListCell>,
                        ]}
                      />
                    </DataListItemRow>
                  </DataListItem>
                ))}
              </DataList>
            </div>
          )}
        </>
      )}

      {upConfirmTarget && (
        <UpConfirmModal
          stack={toSyntheticStack(upConfirmTarget)}
          onConfirm={(profiles) => { setUpTargetProfiles(profiles); setUpTarget(upConfirmTarget); setUpConfirmTarget(null); }}
          onClose={() => setUpConfirmTarget(null)}
        />
      )}
      {upTarget && (
        <UpModal
          stack={toSyntheticStack(upTarget)}
          profiles={upTargetProfiles}
          onClose={(succeeded) => handleUpClose(upTarget.name, succeeded)}
        />
      )}
      {yamlTarget && (
        <YamlModal
          stack={toSyntheticStack(yamlTarget)}
          onClose={() => setYamlTarget(null)}
          onFileAdded={(newPath) => {
            const updated: DownedStack = { ...yamlTarget, configFiles: [...yamlTarget.configFiles, newPath] };
            setYamlTarget(updated);
            updateStack(yamlTarget.name, () => updated);
            setConfigFileOverrides(prev => ({ ...prev, [yamlTarget.name.toLowerCase()]: updated.configFiles }));
          }}
          onFileRemoved={(removedPath) => {
            const updated: DownedStack = { ...yamlTarget, configFiles: yamlTarget.configFiles.filter(f => f !== removedPath) };
            setYamlTarget(updated);
            updateStack(yamlTarget.name, () => updated);
            setConfigFileOverrides(prev => ({ ...prev, [yamlTarget.name.toLowerCase()]: updated.configFiles }));
          }}
        />
      )}
      {createOpen && (
        <CreateStackModal
          stacks={stacks}
          onClose={() => setCreateOpen(false)}
          onCreated={d => { addStack(d); setCreateOpen(false); }}
        />
      )}
      {deleteTarget && (
        <DeleteStackModal
          stack={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            removeStack(deleteTarget.name);
            onUpComplete(deleteTarget.name);
            setDeleteTarget(null);
          }}
        />
      )}
      {backupTarget && (
        <BackupModal
          stack={toSyntheticStack(backupTarget)}
          onClose={() => setBackupTarget(null)}
        />
      )}
      {restoreOpen && (
        <RestoreModal
          existingStacks={stacks}
          defaultScanDir={inferComposeRoot(stacks)}
          onClose={() => setRestoreOpen(false)}
          onRestored={d => { addStack(d); setRestoreOpen(false); }}
        />
      )}
    </>
  );
}
