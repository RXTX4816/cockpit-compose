import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  DataList,
  DataListItem,
  DataListItemRow,
  DataListItemCells,
  DataListCell,
  DataListCheck,
  Button,
  Alert,
  Spinner,
  TextInput,
  Checkbox,
} from "@patternfly/react-core";
import { Tooltip } from "@rxtx4816/cockpit-plugin-base-react/components";
import { PlusCircleIcon, FolderOpenIcon, AngleUpIcon, HistoryIcon, PencilAltIcon, ArchiveIcon, TrashIcon, BroomIcon, TimesIcon } from "@patternfly/react-icons";
import { type ComposeStack } from "../api";
import { type DownedStack, useDownedStacksScan } from "../hooks/useDownedStacksScan";
import { type Layout } from "../lib/layout";
import { UpModal } from "./UpModal";
import { UpConfirmModal } from "./UpConfirmModal";
import { YamlModal } from "./YamlModal";
import { CreateStackModal } from "./CreateStackModal";
import { DeleteStackModal } from "./DeleteStackModal";
import { RestoreModal } from "./RestoreModal";
import { BackupModal } from "./BackupModal";
import { PruneModal } from "./PruneModal";
import { GlobalPruneModal } from "./GlobalPruneModal";
import { BulkActionConfirmModal } from "./BulkActionConfirmModal";
import { useBackgroundTasks } from "../hooks/useBackgroundTasks";
import { buildUpStarter } from "../lib/backgroundActions";
import "./DownedStacksSection.css";
import "./StacksView/UnixRow.css";
import { inferComposeRoot } from "../lib/composeDiscovery";
export { inferComposeRoot } from "../lib/composeDiscovery";
import { useAdminMode } from "@rxtx4816/cockpit-plugin-base-react";

interface Props {
  stacks: ComposeStack[];
  manuallyDownedStacks: DownedStack[];
  onRefresh: () => void;
  onUpComplete: (name: string) => void;
  onAdminMismatch?: (show: boolean) => void;
  layout?: Layout;
}

function toSyntheticStack(d: DownedStack): ComposeStack {
  return { Name: d.name, Status: "", ConfigFiles: d.configFiles.join(",") };
}

export function DownedStacksSection({ stacks, manuallyDownedStacks, onRefresh, onUpComplete, onAdminMismatch, layout }: Props) {
  const { t } = useTranslation();
  const isAdminMode = useAdminMode();
  const [userHome, setUserHome] = useState<string | null>(null);
  useEffect(() => {
    try {
      cockpit.user().then(u => setUserHome(u.home)).catch(() => {});
    } catch { /* cockpit.user unavailable */ }
  }, []);
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
  const [pruneOpen, setPruneOpen] = useState(false);
  const [pruneTarget, setPruneTarget] = useState<DownedStack | null>(null);
  const [backupTarget, setBackupTarget] = useState<DownedStack | null>(null);
  const [miniMenu, setMiniMenu] = useState<{ stack: DownedStack; x: number; y: number } | null>(null);
  const miniMenuRef = useRef<HTMLDivElement>(null);
  const autoDetectedRef = useRef(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const [bulkConfirmStacks, setBulkConfirmStacks] = useState<DownedStack[] | null>(null);
  const { enqueue } = useBackgroundTasks();
  const toggleSelect = useCallback((name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      if (next.size > 0) setShowBulkBar(true);
      return next;
    });
  }, []);

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

  const allSelected = combinedStacks.length > 0 && combinedStacks.every(d => selected.has(d.name));
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (showBulkBar && selected.size === 0) {
      const timer = setTimeout(() => setShowBulkBar(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showBulkBar, selected.size]);

  const handleBulkUpConfirm = useCallback(() => {
    if (!bulkConfirmStacks) return;
    for (const d of bulkConfirmStacks) {
      const stack = toSyntheticStack(d);
      enqueue(
        d.name,
        "up",
        t("up_modal.background_label", { name: d.name }),
        buildUpStarter(stack, []),
        () => { removeStack(d.name); onUpComplete(d.name); onRefresh(); },
      );
    }
    setSelected(new Set());
    setShowBulkBar(false);
    setBulkConfirmStacks(null);
  }, [bulkConfirmStacks, enqueue, t, removeStack, onUpComplete, onRefresh]);

  // Auto-detect the compose root on first stacks load
  useEffect(() => {
    if (autoDetectedRef.current || stacks.length === 0) return;
    const root = inferComposeRoot(stacks);
    if (root) {
      autoDetectedRef.current = true;
      setComposeDir(root);
    }
  }, [stacks]);

  useEffect(() => {
    if (!miniMenu) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (miniMenuRef.current && !miniMenuRef.current.contains(e.target as HTMLElement)) {
        setMiniMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [miniMenu]);

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

  const scanBar = layout === "unix" ? (
    <div className="dss-unix-scan">
      <span className="dss-unix-prompt">$</span>
      <input
        className="dss-unix-input"
        value={composeDir}
        onChange={(e) => handleDirChange(null, e.target.value)}
        placeholder={t("downed_section.dir_placeholder")}
        disabled={scanning}
        onKeyDown={(e) => { if (e.key === "Enter" && composeDir.trim() && !scanning) scan(); }}
        aria-label={t("downed_section.dir_aria")}
      />
      <span className="dss-unix-label">depth:</span>
      <button className="ur-key" onClick={handleDepthMinus} disabled={scanning || maxDepth <= 1}>−</button>
      <span className="dss-unix-depth">{maxDepth}</span>
      <button className="ur-key" onClick={handleDepthPlus} disabled={scanning || maxDepth >= 5}>+</button>
      <button className="ur-key" onClick={handleFindBestMatch} disabled={stacks.length === 0 || scanning}>[auto]</button>
      <button className={`ur-key ur-key--up${scanning ? " ur-key--scanning" : ""}`} onClick={scan} disabled={!composeDir.trim() || scanning}>
        {scanning ? "…" : "[scan]"}
      </button>
      {hasScanned && warning && <span className="dss-unix-warn" title={warning}>⚠</span>}
    </div>
  ) : layout === "minimal" ? (
    <div className="dss-minimal-scan">
      <input
        className="dss-minimal-scan-input"
        value={composeDir}
        onChange={(e) => handleDirChange(null, e.target.value)}
        placeholder={t("downed_section.dir_placeholder")}
        disabled={scanning}
        onKeyDown={(e) => { if (e.key === "Enter" && composeDir.trim() && !scanning) scan(); }}
        aria-label={t("downed_section.dir_aria")}
      />
      <Tooltip content={t("actions.find_best_match_title")}>
        <button className="dss-minimal-scan-btn" onClick={handleFindBestMatch} disabled={stacks.length === 0 || scanning} aria-label={t("actions.find_best_match_title")}>
          <FolderOpenIcon />
        </button>
      </Tooltip>
      <button className="dss-minimal-scan-btn dss-minimal-scan-btn--depth" onClick={handleDepthMinus} disabled={scanning || maxDepth <= 1} aria-label={t("downed_section.depth_minus_aria")}>−</button>
      <span className="dss-minimal-scan-depth">{maxDepth}</span>
      <button className="dss-minimal-scan-btn dss-minimal-scan-btn--depth" onClick={handleDepthPlus} disabled={scanning || maxDepth >= 5} aria-label={t("downed_section.depth_plus_aria")}>+</button>
      <Tooltip content={t("common.scan")}>
        <button className="dss-minimal-scan-btn dss-minimal-scan-btn--go" onClick={scan} disabled={!composeDir.trim() || scanning} aria-label={t("common.scan")}>
          {scanning ? <Spinner size="sm" /> : "↵"}
        </button>
      </Tooltip>
      {hasScanned && warning && <span className="dss-minimal-scan-warn" title={warning}>⚠</span>}
    </div>
  ) : (
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
          <button type="button" className="dss-stepper-btn" onClick={handleDepthMinus} disabled={scanning || maxDepth <= 1} aria-label={t("downed_section.depth_minus_aria")}>−</button>
          <span className="dss-stepper-value" aria-live="polite" aria-label={t("downed_section.depth_aria")}>{maxDepth}</span>
          <button type="button" className="dss-stepper-btn" onClick={handleDepthPlus} disabled={scanning || maxDepth >= 5} aria-label={t("downed_section.depth_plus_aria")}>+</button>
        </div>
        <Button variant="primary" isDisabled={!composeDir.trim() || scanning} isLoading={scanning} onClick={scan} className="dss-scan-btn">
          {t("common.scan")}
        </Button>
      </div>
      {hasScanned && warning && (
        <span className="dss-scan-warning" title={warning}>⚠ {t("downed_section.scan_partial_warning")}</span>
      )}
    </div>
  );

  const showAdminMismatch = Boolean(
    isAdminMode &&
    userHome &&
    composeDir &&
    (composeDir === userHome || composeDir.startsWith(userHome + "/"))
  );

  useEffect(() => {
    onAdminMismatch?.(showAdminMismatch);
  }, [showAdminMismatch, onAdminMismatch]);

  return (
    <>
      {layout === "minimal" ? (
        <div className="dss-minimal-bar">
          <Tooltip content={t("downed_section.create_button")}>
            <Button variant="plain" size="sm" icon={<PlusCircleIcon />} onClick={() => setCreateOpen(true)} aria-label={t("downed_section.create_button")} />
          </Tooltip>
          <Tooltip content={t("downed_section.import_button")}>
            <Button variant="plain" size="sm" icon={importOpen ? <AngleUpIcon /> : <FolderOpenIcon />} onClick={() => setImportOpen(o => !o)} aria-label={t("downed_section.import_button")} aria-expanded={importOpen} />
          </Tooltip>
          <Tooltip content={t("downed_section.restore_button")}>
            <Button variant="plain" size="sm" icon={<HistoryIcon />} onClick={() => setRestoreOpen(true)} aria-label={t("downed_section.restore_button")} />
          </Tooltip>
          <div className="dss-prune-btn">
            <Tooltip content={t("prune_global.button")}>
              <Button variant="plain" size="sm" icon={<BroomIcon />} onClick={() => setPruneOpen(true)} aria-label={t("prune_global.button")} />
            </Tooltip>
          </div>
        </div>
      ) : layout === "unix" ? (
        <div className="dss-unix-bar">
          <button className="ur-key ur-key--up" onClick={() => setCreateOpen(true)}>[new]</button>
          <button className={`ur-key${importOpen ? " ur-key--up" : ""}`} onClick={() => setImportOpen(o => !o)}>[import]</button>
          <button className="ur-key" onClick={() => setRestoreOpen(true)}>[restore]</button>
          <button className="ur-key dss-prune-btn" onClick={() => setPruneOpen(true)}>[prune images]</button>
        </div>
      ) : layout === "pretty" ? (
        <div className="dss-import-bar">
          <Button variant="primary" size="sm" icon={<PlusCircleIcon />} onClick={() => setCreateOpen(true)}>
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
          <Button variant="secondary" size="sm" icon={<HistoryIcon />} onClick={() => setRestoreOpen(true)}>
            {t("downed_section.restore_button")}
          </Button>
          <Button className="dss-prune-btn" variant="secondary" size="sm" icon={<BroomIcon />} onClick={() => setPruneOpen(true)}>
            {t("prune_global.button")}
          </Button>
        </div>
      ) : (
        <div className="dss-import-bar">
          <Button variant="primary" size="sm" icon={<PlusCircleIcon />} onClick={() => setCreateOpen(true)}>
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
          <Button variant="secondary" size="sm" icon={<HistoryIcon />} onClick={() => setRestoreOpen(true)}>
            {t("downed_section.restore_button")}
          </Button>
          <Button className="dss-prune-btn" variant="secondary" size="sm" icon={<BroomIcon />} onClick={() => setPruneOpen(true)}>
            {t("prune_global.button")}
          </Button>
        </div>
      )}

      {importOpen && scanBar}

      {hasContent && (
        <>
          <div className="dss-separator" aria-hidden="true">
            <span className="dss-separator-label">{t("downed_section.down_status")}</span>
          </div>

          {showBulkBar && (
            <div className="dss-bulk-bar" data-testid="dss-bulk-bar">
              <Tooltip content={t(allSelected ? "stacks.deselect_all" : "stacks.select_all")}>
                <Checkbox
                  id="dss-select-all"
                  data-testid="dss-select-all"
                  aria-label={t(allSelected ? "stacks.deselect_all" : "stacks.select_all")}
                  isChecked={allSelected ? true : (someSelected ? null : false)}
                  onChange={() => {
                    if (allSelected) {
                      setSelected(new Set());
                    } else {
                      setSelected(new Set(combinedStacks.map(d => d.name)));
                      setShowBulkBar(true);
                    }
                  }}
                />
              </Tooltip>
              <span className="sv-bulk-count">{t("stacks.bulk_selected", { count: selected.size })}</span>
              <Button
                variant="primary"
                size="sm"
                isDisabled={selected.size === 0}
                onClick={() => setBulkConfirmStacks(combinedStacks.filter(d => selected.has(d.name)))}
              >
                {t("actions.up")}
              </Button>
              <Tooltip content={t("stacks.bulk_clear")}>
                <Button
                  variant="plain"
                  size="sm"
                  aria-label={t("stacks.bulk_clear")}
                  onClick={() => { setSelected(new Set()); setShowBulkBar(false); }}
                >
                  <TimesIcon />
                </Button>
              </Tooltip>
            </div>
          )}

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
            layout === "minimal" ? (
              <div className="dss-list-wrapper">
                <div className="dss-mini-grid">
                  {combinedStacks.map(d => (
                    <div
                      key={d.name}
                      className="dss-mini-card"
                      title={d.configFiles[0] ?? ""}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest(".dss-mini-up") || target.closest(".dss-mini-select")) return;
                        e.preventDefault();
                        setMiniMenu({ stack: d, x: e.clientX, y: e.clientY });
                      }}
                      onContextMenu={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest(".dss-mini-up") || target.closest(".dss-mini-select")) return;
                        e.preventDefault();
                        setMiniMenu({ stack: d, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <input
                        type="checkbox"
                        className={`dss-mini-select${selected.size > 0 ? " dss-mini-select--visible" : ""}`}
                        aria-label={t("stacks.select_stack", { name: d.name })}
                        checked={selected.has(d.name)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleSelect(d.name)}
                      />
                      <span className="dss-mini-name">{d.name}</span>
                      <Tooltip content={t("actions.up_title")}>
                        <Button
                          variant="plain"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setUpConfirmTarget(d); }}
                          aria-label={t("actions.up_title")}
                          className="dss-mini-btn dss-mini-btn--up dss-mini-up"
                        >
                          <AngleUpIcon />
                        </Button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
                {miniMenu && (
                  <div
                    ref={miniMenuRef}
                    className="dss-mini-menu"
                    style={{ left: miniMenu.x, top: miniMenu.y }}
                  >
                    <button className="dss-mini-menu-item" onClick={() => { setYamlTarget(miniMenu.stack); setMiniMenu(null); }}>
                      <PencilAltIcon /> {t("downed_section.edit_title")}
                    </button>
                    <button className="dss-mini-menu-item" onClick={() => { setBackupTarget(miniMenu.stack); setMiniMenu(null); }}>
                      <ArchiveIcon /> {t("actions.backup")}
                    </button>
                    <button className="dss-mini-menu-item" onClick={() => { setPruneTarget(miniMenu.stack); setMiniMenu(null); }}>
                      <BroomIcon /> {t("actions.prune")}
                    </button>
                    <button className="dss-mini-menu-item dss-mini-menu-item--danger" onClick={() => { setDeleteTarget(miniMenu.stack); setMiniMenu(null); }}>
                      <TrashIcon /> {t("downed_section.delete_title")}
                    </button>
                  </div>
                )}
              </div>
            ) : layout === "pretty" ? (
              <div className="dss-pretty-grid">
                {combinedStacks.map(d => (
                  <div
                    key={d.name}
                    className={`dss-pretty-card${selected.has(d.name) ? " dss-pretty-card--selected" : ""}`}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest("button, input, a")) return;
                      toggleSelect(d.name);
                    }}
                    aria-pressed={selected.has(d.name)}
                  >
                    <div className="dss-pretty-body">
                      <span className="dss-pretty-name">{d.name}</span>
                      <span className="dss-pretty-path">{d.configFiles[0]?.replace(/\/[^/]+$/, "") ?? ""}</span>
                    </div>
                    <div className="dss-pretty-actions">
                      <button className="dss-pretty-up" onClick={() => setUpConfirmTarget(d)} aria-label={t("actions.up_title")}>
                        <AngleUpIcon /> {t("actions.up")}
                      </button>
                      <div className="dss-pretty-icons">
                        <Tooltip content={t("downed_section.edit_title")}>
                          <Button variant="plain" size="sm" onClick={() => setYamlTarget(d)} aria-label={t("downed_section.edit_title")}><PencilAltIcon /></Button>
                        </Tooltip>
                        <Tooltip content={t("actions.backup")}>
                          <Button variant="plain" size="sm" onClick={() => setBackupTarget(d)} aria-label={t("actions.backup")}><ArchiveIcon /></Button>
                        </Tooltip>
                        <Tooltip content={t("actions.prune")}>
                          <Button variant="plain" size="sm" onClick={() => setPruneTarget(d)} aria-label={t("actions.prune")}><BroomIcon /></Button>
                        </Tooltip>
                        <Tooltip content={t("downed_section.delete_title")}>
                          <Button variant="plain" size="sm" onClick={() => setDeleteTarget(d)} aria-label={t("downed_section.delete_title")} className="dss-delete-btn"><TrashIcon /></Button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : layout === "unix" ? (
              <div className="dss-unix-list">
                {combinedStacks.map(d => (
                  <div key={d.name} className="dss-unix-row">
                    <span className="dss-unix-name">{d.name}</span>
                    <span className="dss-unix-path" title={d.configFiles[0] ?? ""}>{d.configFiles[0]?.replace(/.*\/([^/]+\/[^/]+)$/, "$1") ?? ""}</span>
                    <div className="dss-unix-actions">
                      <button
                        className={`ur-key ur-key--select${selected.has(d.name) ? " ur-key--select-on" : ""}`}
                        onClick={() => toggleSelect(d.name)}
                        aria-pressed={selected.has(d.name)}
                        aria-label={t("stacks.select_stack", { name: d.name })}
                      >
                        {selected.has(d.name) ? "[x]" : "[ ]"}
                      </button>
                      <Tooltip content={t("actions.up_title")}>
                        <button className="ur-key ur-key--up" onClick={() => setUpConfirmTarget(d)}>[up]</button>
                      </Tooltip>
                      <Tooltip content={t("downed_section.edit_title")}>
                        <button className="ur-key" onClick={() => setYamlTarget(d)}>[ed]</button>
                      </Tooltip>
                      <Tooltip content={t("actions.backup")}>
                        <button className="ur-key" onClick={() => setBackupTarget(d)}>[bak]</button>
                      </Tooltip>
                      <Tooltip content={t("actions.prune")}>
                        <button className="ur-key" onClick={() => setPruneTarget(d)}>[prune]</button>
                      </Tooltip>
                      <Tooltip content={t("downed_section.delete_title")}>
                        <button className="ur-key ur-key--down" onClick={() => setDeleteTarget(d)}>[del]</button>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dss-list-wrapper">
                <DataList aria-label={t("downed_section.down_stacks_aria")} isCompact className="dss-list">
                  {combinedStacks.map(d => (
                    <DataListItem key={d.name} aria-labelledby={`dss-name-${d.name}`} data-status="down">
                      <DataListItemRow
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest("button, input, select, a")) return;
                          toggleSelect(d.name);
                        }}
                        style={{ cursor: "pointer" }}
                        className={selected.has(d.name) ? "dss-row--selected" : undefined}
                      >
                        <DataListCheck
                          aria-labelledby={`dss-name-${d.name}`}
                          aria-label={t("stacks.select_stack", { name: d.name })}
                          isChecked={selected.has(d.name)}
                          onChange={() => toggleSelect(d.name)}
                          className={`dss-check${selected.size > 0 ? " dss-check--visible" : ""}`}
                        />
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
                                <Tooltip content={t("actions.prune")}>
                                  <Button variant="plain" size="sm" onClick={() => setPruneTarget(d)} aria-label={t("actions.prune")}>
                                    <BroomIcon />
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
            )
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
          defaultScanDir={inferComposeRoot([...stacks, ...manuallyDownedStacks.map(toSyntheticStack)])}
          onClose={() => setRestoreOpen(false)}
          onRestored={d => { addStack(d); setRestoreOpen(false); }}
        />
      )}
      {pruneOpen && (
        <GlobalPruneModal
          onClose={() => setPruneOpen(false)}
          onSuccess={onRefresh}
        />
      )}
      {pruneTarget && (
        <PruneModal
          stack={toSyntheticStack(pruneTarget)}
          onClose={() => setPruneTarget(null)}
          onSuccess={onRefresh}
        />
      )}
      {bulkConfirmStacks && (
        <BulkActionConfirmModal
          stacks={bulkConfirmStacks.map(toSyntheticStack)}
          action="up"
          onConfirm={handleBulkUpConfirm}
          onClose={() => setBulkConfirmStacks(null)}
        />
      )}
    </>
  );
}
