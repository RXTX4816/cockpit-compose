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
  Label,
  InputGroup,
  InputGroupItem,
  TextInput,
} from "@patternfly/react-core";
import { type ComposeStack } from "../api";
import { type DownedStack, useDownedStacksScan } from "../hooks/useDownedStacksScan";
import { UpModal } from "./UpModal";
import { YamlModal } from "./YamlModal";
import { CreateStackModal } from "./CreateStackModal";
import { DeleteStackModal } from "./DeleteStackModal";
import "./DownedStacksSection.css";

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
    const configFile = stack.ConfigFiles.split(",")[0].trim();
    const stackDir = configFile.slice(0, configFile.lastIndexOf("/"));
    const parent = stackDir.slice(0, stackDir.lastIndexOf("/"));
    if (parent) tally.set(parent, (tally.get(parent) ?? 0) + 1);
  }
  if (tally.size === 0) return "";
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return best[0][0];
}

function isUnambiguousRoot(stacks: ComposeStack[], root: string): boolean {
  if (!root || stacks.length === 0) return false;
  return stacks.every(s => {
    const cf = s.ConfigFiles.split(",")[0].trim();
    const stackDir = cf.slice(0, cf.lastIndexOf("/"));
    return stackDir.slice(0, stackDir.lastIndexOf("/")) === root;
  });
}

function toSyntheticStack(d: DownedStack): ComposeStack {
  return { Name: d.name, Status: "", ConfigFiles: d.configFile };
}

export function DownedStacksSection({ stacks, manuallyDownedStacks, onRefresh, onUpComplete }: Props) {
  const { t } = useTranslation();
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [composeDir, setComposeDir] = useState("");
  const [upTarget, setUpTarget] = useState<DownedStack | null>(null);
  const [yamlTarget, setYamlTarget] = useState<DownedStack | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DownedStack | null>(null);
  const autoDetectedRef = useRef(false);

  const { downedStacks, scanning, hasScanned, error, scan, removeStack, addStack }
    = useDownedStacksScan(composeDir, stacks);

  // Merge manually downed + scanned, dedup by name
  const combinedStacks: DownedStack[] = [
    ...manuallyDownedStacks,
    ...downedStacks.filter(d =>
      !manuallyDownedStacks.some(m => m.name.toLowerCase() === d.name.toLowerCase())
    ),
  ];

  // Auto-detect the compose root on first stacks load if unambiguous
  useEffect(() => {
    if (autoDetectedRef.current || stacks.length === 0) return;
    const root = inferComposeRoot(stacks);
    if (isUnambiguousRoot(stacks, root)) {
      autoDetectedRef.current = true;
      setComposeDir(root);
    }
  }, [stacks]);

  const handleDirChange = useCallback((_e: unknown, val: string) => {
    setComposeDir(val);
    // do not clear scan results here — they persist until next scan runs
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
          onClick={() => setCreateOpen(true)}
        >
          {t("downed_section.create_button")}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setImportOpen(o => !o)}
          aria-expanded={importOpen}
        >
          {importOpen ? "▲" : "▼"} {t("downed_section.import_button")}
        </Button>
      </div>

      {importOpen && (
        <div className="dss-controls">
          <Button
            variant="secondary"
            size="sm"
            isDisabled={stacks.length === 0 || scanning}
            onClick={handleFindBestMatch}
            title={t("actions.find_best_match_title")}
          >
            {t("actions.find_best_match")}
          </Button>
          <InputGroup className="dss-input-group">
            <InputGroupItem isFill>
              <TextInput
                aria-label={t("downed_section.dir_aria")}
                placeholder={t("downed_section.dir_placeholder")}
                value={composeDir}
                onChange={handleDirChange}
                isDisabled={scanning}
              />
            </InputGroupItem>
            <InputGroupItem>
              <Button
                variant="primary"
                isDisabled={!composeDir.trim() || scanning}
                isLoading={scanning}
                onClick={scan}
                className="dss-scan-btn"
              >
                {t("common.scan")}
              </Button>
            </InputGroupItem>
          </InputGroup>
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
                  <DataListItem key={d.name} aria-labelledby={`dss-name-${d.name}`}>
                    <DataListItemRow>
                      <DataListItemCells
                        dataListCells={[
                          <DataListCell key="name" width={2}>
                            <span id={`dss-name-${d.name}`} className="dss-stack-name">
                              {d.name}
                            </span>
                            <Label color="grey" isCompact className="dss-status-label">{t("downed_section.down_status")}</Label>
                          </DataListCell>,
                          <DataListCell key="path" width={3}>
                            <code className="dss-config-path">{d.configFile}</code>
                          </DataListCell>,
                          <DataListCell key="actions" width={2} className="dss-actions">
                            <Button variant="primary" size="sm" onClick={() => setUpTarget(d)}>
                              ↑ {t("actions.up")}
                            </Button>
                            <Button variant="plain" size="sm" onClick={() => setYamlTarget(d)} title={t("downed_section.edit_title")}>
                              {t("common.edit")}
                            </Button>
                            <Button
                              variant="plain"
                              size="sm"
                              onClick={() => setDeleteTarget(d)}
                              title={t("downed_section.delete_title")}
                              className="dss-delete-btn"
                            >
                              ✕ {t("common.delete")}
                            </Button>
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

      {upTarget && (
        <UpModal
          stack={toSyntheticStack(upTarget)}
          onClose={(succeeded) => handleUpClose(upTarget.name, succeeded)}
        />
      )}
      {yamlTarget && (
        <YamlModal
          stack={toSyntheticStack(yamlTarget)}
          onClose={() => setYamlTarget(null)}
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
    </>
  );
}
