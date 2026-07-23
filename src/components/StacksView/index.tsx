import { useState, useCallback, useRef, useEffect } from "react";
import { useSharedNetworks } from "../../hooks/useSharedNetworks";
import { useTranslation } from "react-i18next";
import { useDialogState } from "@rxtx4816/cockpit-plugin-base-react";
import { useStackFilters } from "../../hooks/useStackFilters";
import { useExpandedStacks } from "../../hooks/useExpandedStacks";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useOperationCounter } from "../../hooks/useOperationCounter";
import {
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Title,
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateActions,
  EmptyStateFooter,
  DataList,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  SearchInput,
  Label,
  Spinner,
  Checkbox,
} from "@patternfly/react-core";
import { Tooltip } from "@rxtx4816/cockpit-plugin-base-react/components";
import { type ComposeStack, type Runtime } from "../../api";
import {
  TimesCircleIcon, TimesIcon, BanIcon, PlusCircleIcon, FolderOpenIcon, SearchIcon, ExclamationTriangleIcon,
  DownloadIcon, RedoAltIcon, ArrowAltCircleDownIcon,
} from "@patternfly/react-icons";
import { type DownedStack } from "../../hooks/useDownedStacksScan";
import { useComposeStacks } from "../../hooks/useComposeStacks";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useDownStack } from "../../hooks/useDownStack";
import { useKillStack } from "../../hooks/useKillStack";
import { LogsModal } from "../LogsModal";
import { YamlModal } from "../YamlModal";
import { StackInfoModal } from "../StackInfoModal";
import { PullModal } from "../PullModal";
import { PullConfirmModal } from "../PullConfirmModal";
import { UpModal } from "../UpModal";
import { UpConfirmModal } from "../UpConfirmModal";
import { EventsModal } from "../EventsModal";
import { TopModal } from "../TopModal";
import { ExecModal } from "../ExecModal";
import { RunModal } from "../RunModal";
import { PruneModal } from "../PruneModal";
import { BackupModal } from "../BackupModal";
import { ScaleModal } from "../ScaleModal";
import { DownedStacksSection } from "../DownedStacksSection";
import { BulkActionConfirmModal, type BulkAction } from "../BulkActionConfirmModal";
import { useBackgroundTasks } from "../../hooks/useBackgroundTasks";
import { useToast } from "../ToastProvider";
import { buildUpStarter, buildPullStarter, buildRestartStarter, buildDownStarter, buildKillStarter } from "../../lib/backgroundActions";
import { StackRow } from "./StackRow";
import { MinimalCard } from "./MinimalCard";
import { PrettyCard } from "./PrettyCard";
import { UnixRow } from "./UnixRow";
import "./UnixRow.css";
import { RuntimeToggle } from "../RuntimeToggle";
import { LayoutSelector } from "../LayoutSelector";
import { StackSkeleton } from "./StackSkeleton";
import "./StacksView.css";
import { splitConfigFiles } from "../../lib/configFiles";
import { type Layout } from "../../lib/layout";

const BULK_STARTERS: Record<BulkAction, typeof buildUpStarter> = {
  up: buildUpStarter,
  pull: buildPullStarter,
  restart: buildRestartStarter,
  down: buildDownStarter,
  kill: buildKillStarter,
};

const filterColorMap: Record<string, "green" | "orange" | "grey" | "blue"> = {
  running: "green",
  partial: "orange",
  stopped: "grey",
  paused: "blue",
};

interface Props {
  onRuntimeChange?: (runtime: Runtime) => void;
  dockerMissing?: boolean;
  layout?: Layout;
  onLayoutChange?: (layout: Layout) => void;
}

export function StacksView({ onRuntimeChange, dockerMissing, layout = "poweruser", onLayoutChange = () => {} }: Props) {
  const { t } = useTranslation();
  const { stacks, loading, error, refresh, reset } = useComposeStacks();
  const [manuallyDownedStacks, setManuallyDownedStacks] = useState<DownedStack[]>([]);
  const [runtimeSwitchKey, setRuntimeSwitchKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [adminMismatch, setAdminMismatch] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // Extracted hooks
  type ComposeModals = {
    logs: ComposeStack; yaml: ComposeStack; info: ComposeStack;
    upConfirm: ComposeStack; up: ComposeStack;
    pullConfirm: ComposeStack; pull: ComposeStack;
    down: ComposeStack; kill: ComposeStack; env: ComposeStack;
    scale: ComposeStack; prune: ComposeStack; exec: ComposeStack;
    run: ComposeStack; events: ComposeStack; top: ComposeStack; backup: ComposeStack;
    bulkConfirm: { stacks: ComposeStack[]; action: BulkAction };
  };
  const MODAL_NAMES = [
    "logs", "yaml", "info", "upConfirm", "up", "pullConfirm", "pull",
    "down", "kill", "env", "scale", "prune", "exec", "run", "events", "top", "backup", "bulkConfirm",
  ] as const;
  const modals = useDialogState<ComposeModals>(MODAL_NAMES);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const toggleSelect = useCallback((name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      if (next.size > 0) setShowBulkBar(true);
      return next;
    });
  }, []);
  const [upProfiles, setUpProfiles] = useState<string[]>([]);
  const { enqueue, clearPending } = useBackgroundTasks();
  const toast = useToast();
  const { expanded, toggleExpanded } = useExpandedStacks();
  const { activeOps, increment, decrement } = useOperationCounter();
  const {
    searchTerm, setSearchTerm, activeFilters, toggleFilter,
    filteredStacks: displayedStacks, statusCounts, STATUS_FILTER_OPTIONS, clearFilters,
  } = useStackFilters(stacks);
  const allSelected = displayedStacks.length > 0 && displayedStacks.every(s => selected.has(s.Name));
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (searchOpen) {
      const input = searchWrapRef.current?.querySelector("input");
      input?.focus();
    }
  }, [searchOpen]);

  useEffect(() => {
    if (searchTerm) setSearchOpen(true);
  }, [searchTerm]);

  useEffect(() => {
    if (showBulkBar && selected.size === 0) {
      const timer = setTimeout(() => setShowBulkBar(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showBulkBar, selected.size]);

  const onActingChange = useCallback((delta: 1 | -1) => {
    if (delta > 0) increment(); else decrement();
  }, [increment, decrement]);

  const handleDownComplete = useCallback((stack: ComposeStack) => {
    setManuallyDownedStacks(prev =>
      prev.some(d => d.name.toLowerCase() === stack.Name.toLowerCase())
        ? prev
        : [...prev, { name: stack.Name, configFiles: splitConfigFiles(stack.ConfigFiles) }]
    );
  }, []);

  const handleUpComplete = useCallback((name: string) => {
    setManuallyDownedStacks(prev => prev.filter(d => d.name.toLowerCase() !== name.toLowerCase()));
  }, []);

  const handleBulkConfirm = useCallback(() => {
    const data = modals.getData("bulkConfirm");
    if (!data) return;
    const buildStarter = BULK_STARTERS[data.action];
    for (const stack of data.stacks) {
      enqueue(
        stack.Name,
        data.action,
        t(`${data.action}_modal.background_label`, { name: stack.Name }),
        buildStarter(stack),
        data.action === "down" ? () => handleDownComplete(stack) : undefined,
      );
    }
    setSelected(new Set());
    setShowBulkBar(false);
    modals.close("bulkConfirm");
  }, [modals, enqueue, t, handleDownComplete]);

  const { target: downTarget, downing, error: downError, open: openDown, close: closeDown, execute: performDown }
    = useDownStack(refresh, onActingChange, handleDownComplete);

  const { target: killTarget, killing, error: killError, open: openKill, close: closeKill, execute: performKill }
    = useKillStack(refresh, onActingChange);

  const { sharedNetworks: downSharedNetworks, loading: downNetworksLoading } =
    useSharedNetworks(downTarget?.Name ?? "", downTarget !== null);

  useAutoRefresh(refresh, error ? 2000 : 500, activeOps > 0);

  // Keyboard shortcuts: U=up, D=down, L=logs, E=edit, I=info
  useKeyboardShortcuts(
    {
      u: () => {
        const row = (document.activeElement as HTMLElement)?.closest("[data-stack-name]") as HTMLElement | null;
        const stack = stacks.find(s => s.Name === row?.dataset.stackName);
        if (stack) modals.open("upConfirm", stack);
      },
      d: () => {
        const row = (document.activeElement as HTMLElement)?.closest("[data-stack-name]") as HTMLElement | null;
        const stack = stacks.find(s => s.Name === row?.dataset.stackName);
        if (stack) openDown(stack);
      },
      l: () => {
        const row = (document.activeElement as HTMLElement)?.closest("[data-stack-name]") as HTMLElement | null;
        const stack = stacks.find(s => s.Name === row?.dataset.stackName);
        if (stack) modals.open("logs", stack);
      },
      e: () => {
        const row = (document.activeElement as HTMLElement)?.closest("[data-stack-name]") as HTMLElement | null;
        const stack = stacks.find(s => s.Name === row?.dataset.stackName);
        if (stack) modals.open("yaml", stack);
      },
      i: () => {
        const row = (document.activeElement as HTMLElement)?.closest("[data-stack-name]") as HTMLElement | null;
        const stack = stacks.find(s => s.Name === row?.dataset.stackName);
        if (stack) modals.open("info", stack);
      },
    },
    [stacks, openDown, modals.open],
  );

  return (
    <>
      <Toolbar className="sv-toolbar">
        <ToolbarContent>
          <ToolbarItem>
            <Title headingLevel="h2">{t("stacks.title")}</Title>
          </ToolbarItem>

          {stacks.length > 0 && (
            <ToolbarItem>
              <div className="sv-status-badges">
                {STATUS_FILTER_OPTIONS.filter(f => (statusCounts[f] ?? 0) > 0).map(f => (
                  <Tooltip key={f} content={t(`stacks.filter_tooltip_${f}`)}>
                    <Label
                      isCompact
                      color={filterColorMap[f]}
                      className={`sv-filter-chip${activeFilters.has(f) ? " sv-filter-chip--active" : ""}`}
                      onClick={() => toggleFilter(f)}
                    >
                      {statusCounts[f]} {t(`stacks.status_${f}`)}
                    </Label>
                  </Tooltip>
                ))}
              </div>
            </ToolbarItem>
          )}

          {stacks.length > 0 && (
            <ToolbarItem>
              {searchOpen ? (
                <div
                  ref={searchWrapRef}
                  className="sv-search-wrap"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as HTMLElement) && !searchTerm) {
                      setSearchOpen(false);
                    }
                  }}
                >
                  <SearchInput
                    className="sv-search"
                    value={searchTerm}
                    onChange={(_e, v) => setSearchTerm(v)}
                    onClear={() => { setSearchTerm(""); setSearchOpen(false); }}
                    placeholder={t("stacks.search_placeholder")}
                    aria-label={t("stacks.search_placeholder")}
                    onKeyDown={(e) => { if (e.key === "Escape") { setSearchTerm(""); setSearchOpen(false); } }}
                  />
                </div>
              ) : (
                <Tooltip content={t("stacks.search_placeholder")}>
                  <Button
                    variant="plain"
                    size="sm"
                    onClick={() => setSearchOpen(true)}
                    aria-label={t("stacks.search_placeholder")}
                    className="sv-search-trigger"
                  >
                    <SearchIcon />
                  </Button>
                </Tooltip>
              )}
            </ToolbarItem>
          )}

          {adminMismatch && (
            <ToolbarItem>
              <Tooltip content={t("downed_section.admin_mismatch_tooltip")}>
                <Label color="orange" icon={<ExclamationTriangleIcon />} isCompact>
                  {t("downed_section.admin_mismatch_badge")}
                </Label>
              </Tooltip>
            </ToolbarItem>
          )}

          {showBulkBar && (
            <ToolbarItem>
              <div className="sv-bulk-bar" data-testid="sv-bulk-bar">
                <Tooltip content={t(allSelected ? "stacks.deselect_all" : "stacks.select_all")}>
                  <Checkbox
                    id="sv-select-all"
                    data-testid="sv-select-all"
                    aria-label={t(allSelected ? "stacks.deselect_all" : "stacks.select_all")}
                    isChecked={allSelected ? true : (someSelected ? null : false)}
                    onChange={() => {
                      if (allSelected) {
                        setSelected(new Set());
                      } else {
                        setSelected(new Set(displayedStacks.map(s => s.Name)));
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
                  onClick={() => modals.open("bulkConfirm", {
                    stacks: displayedStacks.filter(s => selected.has(s.Name)), action: "up",
                  })}
                >
                  {t("actions.up")}
                </Button>
                <span className="sr-icon-group">
                  <Tooltip content={t("actions.restart")}>
                    <Button
                      variant="plain"
                      size="sm"
                      isDisabled={selected.size === 0}
                      aria-label={t("actions.restart")}
                      onClick={() => modals.open("bulkConfirm", {
                        stacks: displayedStacks.filter(s => selected.has(s.Name)), action: "restart",
                      })}
                    >
                      <RedoAltIcon />
                    </Button>
                  </Tooltip>
                  <Tooltip content={t("actions.pull_title")}>
                    <Button
                      variant="plain"
                      size="sm"
                      isDisabled={selected.size === 0}
                      aria-label={t("actions.pull_title")}
                      onClick={() => modals.open("bulkConfirm", {
                        stacks: displayedStacks.filter(s => selected.has(s.Name)), action: "pull",
                      })}
                    >
                      <DownloadIcon />
                    </Button>
                  </Tooltip>
                  <Tooltip content={t("actions.down_title")}>
                    <Button
                      variant="plain"
                      size="sm"
                      className="sr-down-btn"
                      isDisabled={selected.size === 0}
                      aria-label={t("actions.down_title")}
                      onClick={() => modals.open("bulkConfirm", {
                        stacks: displayedStacks.filter(s => selected.has(s.Name)), action: "down",
                      })}
                    >
                      <ArrowAltCircleDownIcon />
                    </Button>
                  </Tooltip>
                  <Tooltip content={t("actions.kill")}>
                    <Button
                      variant="plain"
                      size="sm"
                      isDisabled={selected.size === 0}
                      aria-label={t("actions.kill")}
                      onClick={() => modals.open("bulkConfirm", {
                        stacks: displayedStacks.filter(s => selected.has(s.Name)), action: "kill",
                      })}
                    >
                      <BanIcon />
                    </Button>
                  </Tooltip>
                </span>
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
            </ToolbarItem>
          )}

          <ToolbarItem align={{ default: "alignEnd" }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <LayoutSelector layout={layout} onLayoutChange={onLayoutChange} />
              <RuntimeToggle
                onRuntimeChange={(r) => {
                  setRuntimeSwitchKey(k => k + 1);
                  reset();
                  setSelected(new Set());
                  setShowBulkBar(false);
                  const cancelled = clearPending();
                  if (cancelled > 0) toast.warn(t("stacks.runtime_switch_cancelled_tasks", { count: cancelled }));
                  onRuntimeChange?.(r);
                }}
                onSocketModeChange={() => reset()}
                suggestPodman={dockerMissing}
              />
            </div>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {error && (
        <Alert
          variant="danger"
          isInline
          title={t("stacks.load_failed")}
          style={{ marginBottom: "1rem" }}
          actionLinks={<Button variant="link" size="sm" onClick={refresh}>{t("common.retry")}</Button>}
        >
          {error}
        </Alert>
      )}

      {!error && (loading && stacks.length === 0 ? (
        <StackSkeleton />
      ) : stacks.length === 0 ? (
        <EmptyState headingLevel="h3" titleText={t("stacks.empty_title")} icon={undefined}>
          <EmptyStateBody>
            {t("stacks.empty_body")}
          </EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button
                variant="primary"
                icon={<PlusCircleIcon />}
                onClick={() => {
                  document.querySelector<HTMLButtonElement>(".dss-import-bar button")?.click();
                }}
              >
                {t("stacks.empty_create")}
              </Button>
              <Button
                variant="link"
                icon={<FolderOpenIcon />}
                onClick={() => {
                  const importBtn = document.querySelectorAll<HTMLButtonElement>(".dss-import-bar button")[1];
                  importBtn?.click();
                }}
              >
                {t("stacks.empty_import")}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : displayedStacks.length === 0 && (searchTerm || activeFilters.size > 0) ? (
        <EmptyState headingLevel="h3" titleText={t("stacks.no_results_title")}>
          <EmptyStateBody>{t("stacks.no_results_body")}</EmptyStateBody>
          <EmptyStateFooter>
            <EmptyStateActions>
              <Button variant="link" onClick={clearFilters}>
                {t("stacks.clear_filters")}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : layout === "minimal" ? (
        <div className="sv-minimal-grid">
          {displayedStacks.map(stack => (
            <MinimalCard
              key={stack.Name}
              stack={stack}
              expanded={expanded.has(stack.Name)}
              onToggle={() => toggleExpanded(stack.Name)}
              onLogs={() => modals.open("logs", stack)}
              onYaml={() => modals.open("yaml", stack)}
              onInfo={() => modals.open("info", stack)}
              onDown={() => openDown(stack)}
              onKill={() => openKill(stack)}
              onUp={() => modals.open("upConfirm", stack)}
              onPull={() => modals.open("pullConfirm", stack)}
              onEvents={() => modals.open("events", stack)}
              onTop={() => modals.open("top", stack)}
              onExec={() => modals.open("exec", stack)}
              onRun={() => modals.open("run", stack)}
              onPrune={() => modals.open("prune", stack)}
              onBackup={() => modals.open("backup", stack)}
              onScale={() => modals.open("scale", stack)}
              onActingChange={onActingChange}
              isSelected={selected.has(stack.Name)}
              onToggleSelect={() => toggleSelect(stack.Name)}
            />
          ))}
        </div>
      ) : layout === "pretty" ? (
        <div className="sv-pretty-grid">
          {displayedStacks.map(stack => (
            <PrettyCard
              key={stack.Name}
              stack={stack}
              expanded={expanded.has(stack.Name)}
              onToggle={() => toggleExpanded(stack.Name)}
              onLogs={() => modals.open("logs", stack)}
              onYaml={() => modals.open("yaml", stack)}
              onInfo={() => modals.open("info", stack)}
              onDown={() => openDown(stack)}
              onKill={() => openKill(stack)}
              onUp={() => modals.open("upConfirm", stack)}
              onPull={() => modals.open("pullConfirm", stack)}
              onEvents={() => modals.open("events", stack)}
              onTop={() => modals.open("top", stack)}
              onExec={() => modals.open("exec", stack)}
              onRun={() => modals.open("run", stack)}
              onPrune={() => modals.open("prune", stack)}
              onBackup={() => modals.open("backup", stack)}
              onScale={() => modals.open("scale", stack)}
              onActingChange={onActingChange}
              isSelected={selected.has(stack.Name)}
              onToggleSelect={() => toggleSelect(stack.Name)}
            />
          ))}
        </div>
      ) : layout === "unix" ? (
        <div className="sv-unix-container">
          <div className="sv-unix-header">
            <span />
            <span className="sv-unix-header-col">NAME</span>
            <span className="sv-unix-header-col">STATUS</span>
            <span className="sv-unix-header-col sv-unix-header-col--right">SVC</span>
            <span className="sv-unix-header-col sv-unix-header-col--right">CPU</span>
            <span className="sv-unix-header-col sv-unix-header-col--right">MEM</span>
            <span className="sv-unix-header-col">PORTS</span>
            <span className="sv-unix-header-col sv-unix-header-col--right">ACTIONS</span>
          </div>
          {displayedStacks.map(stack => (
            <UnixRow
              key={stack.Name}
              stack={stack}
              expanded={expanded.has(stack.Name)}
              onToggle={() => toggleExpanded(stack.Name)}
              onLogs={() => modals.open("logs", stack)}
              onYaml={() => modals.open("yaml", stack)}
              onInfo={() => modals.open("info", stack)}
              onDown={() => openDown(stack)}
              onKill={() => openKill(stack)}
              onUp={() => modals.open("upConfirm", stack)}
              onPull={() => modals.open("pullConfirm", stack)}
              onEvents={() => modals.open("events", stack)}
              onTop={() => modals.open("top", stack)}
              onExec={() => modals.open("exec", stack)}
              onRun={() => modals.open("run", stack)}
              onPrune={() => modals.open("prune", stack)}
              onBackup={() => modals.open("backup", stack)}
              onScale={() => modals.open("scale", stack)}
              onActingChange={onActingChange}
              isSelected={selected.has(stack.Name)}
              onToggleSelect={() => toggleSelect(stack.Name)}
            />
          ))}
        </div>
      ) : (
        <DataList aria-label={t("stacks.aria_label")} isCompact>
          {displayedStacks.map(stack => (
            <StackRow
              key={stack.Name}
              stack={stack}
              expanded={expanded.has(stack.Name)}
              onToggle={() => toggleExpanded(stack.Name)}
              onLogs={() => modals.open("logs", stack)}
              onYaml={() => modals.open("yaml", stack)}
              onInfo={() => modals.open("info", stack)}
              onDown={() => openDown(stack)}
              onKill={() => openKill(stack)}
              onUp={() => modals.open("upConfirm", stack)}
              onPull={() => modals.open("pullConfirm", stack)}
              onEvents={() => modals.open("events", stack)}
              onTop={() => modals.open("top", stack)}
              onExec={() => modals.open("exec", stack)}
              onRun={() => modals.open("run", stack)}
              onPrune={() => modals.open("prune", stack)}
              onBackup={() => modals.open("backup", stack)}
              onScale={() => modals.open("scale", stack)}
              onActingChange={onActingChange}
              isSelected={selected.has(stack.Name)}
              onToggleSelect={() => toggleSelect(stack.Name)}
              anySelected={selected.size > 0}
            />
          ))}
        </DataList>
      ))}

      {loading && stacks.length > 0 && (
        <div className="sv-refresh-indicator" aria-label={t("stacks.refreshing")}>
          <Spinner size="sm" />
        </div>
      )}

      <DownedStacksSection
        key={runtimeSwitchKey}
        stacks={stacks}
        manuallyDownedStacks={manuallyDownedStacks}
        onRefresh={refresh}
        onUpComplete={handleUpComplete}
        onAdminMismatch={setAdminMismatch}
        layout={layout}
      />

      {modals.isOpen("logs") && <LogsModal stack={modals.getData("logs")!} onClose={() => modals.close("logs")} />}
      {modals.isOpen("yaml") && (
        <YamlModal
          stack={modals.getData("yaml")!}
          onClose={() => modals.close("yaml")}
          onFileAdded={(newPath) => {
            const prev = modals.getData("yaml");
            if (prev) modals.open("yaml", { ...prev, ConfigFiles: [prev.ConfigFiles, newPath].join(",") });
          }}
          onFileRemoved={(removedPath) => {
            const prev = modals.getData("yaml");
            if (prev) modals.open("yaml", { ...prev, ConfigFiles: prev.ConfigFiles.split(",").map(f => f.trim()).filter(f => f !== removedPath).join(",") });
          }}
        />
      )}
      {modals.isOpen("info") && <StackInfoModal stack={modals.getData("info")!} onClose={() => modals.close("info")} />}
      {modals.isOpen("upConfirm") && (
        <UpConfirmModal
          stack={modals.getData("upConfirm")!}
          onConfirm={(profiles) => {
            setUpProfiles(profiles);
            modals.transition("upConfirm", "up");
          }}
          onClose={() => modals.close("upConfirm")}
        />
      )}
      {modals.isOpen("up") && (
        <UpModal
          stack={modals.getData("up")!}
          profiles={upProfiles}
          onClose={() => { modals.close("up"); void refresh(); }}
        />
      )}
      {modals.isOpen("pullConfirm") && (
        <PullConfirmModal
          stack={modals.getData("pullConfirm")!}
          onConfirm={() => modals.transition("pullConfirm", "pull")}
          onClose={() => modals.close("pullConfirm")}
        />
      )}
      {modals.isOpen("pull") && <PullModal stack={modals.getData("pull")!} onClose={() => modals.close("pull")} />}
      {modals.isOpen("events") && <EventsModal stack={modals.getData("events")!} onClose={() => modals.close("events")} />}
      {modals.isOpen("top") && <TopModal stack={modals.getData("top")!} onClose={() => modals.close("top")} />}
      {modals.isOpen("exec") && <ExecModal stack={modals.getData("exec")!} onClose={() => modals.close("exec")} />}
      {modals.isOpen("run") && <RunModal stack={modals.getData("run")!} onClose={() => modals.close("run")} />}
      {modals.isOpen("prune") && (
        <PruneModal
          stack={modals.getData("prune")!}
          onClose={() => modals.close("prune")}
          onSuccess={refresh}
        />
      )}
      {modals.isOpen("backup") && (
        <BackupModal stack={modals.getData("backup")!} onClose={() => modals.close("backup")} />
      )}
      {modals.isOpen("scale") && (
        <ScaleModal stack={modals.getData("scale")!} onClose={() => modals.close("scale")} onSuccess={refresh} />
      )}
      {modals.isOpen("bulkConfirm") && (
        <BulkActionConfirmModal
          stacks={modals.getData("bulkConfirm")!.stacks}
          action={modals.getData("bulkConfirm")!.action}
          onConfirm={handleBulkConfirm}
          onClose={() => modals.close("bulkConfirm")}
        />
      )}

      {downTarget && (
        <Modal
          isOpen
          variant="small"
          onClose={() => { if (!downing) closeDown(); }}
          aria-label={t("down_modal.aria_label")}
        >
          <ModalHeader title={t("down_modal.title", { name: downTarget.Name })} />
          <ModalBody>
            <p>
              {t("down_modal.body_prefix")} <code>docker compose down</code>{" "}
              {t("down_modal.body_suffix")} <strong>{downTarget.Name}</strong>{t("down_modal.body_suffix2")}
            </p>
            {downNetworksLoading && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem", color: "var(--pf-t--global--text--color--subtle)", fontSize: "0.875rem" }}>
                <Spinner size="sm" />
                {t("down_modal.checking_networks")}
              </div>
            )}
            {!downNetworksLoading && downSharedNetworks.filter(n => n.sharedWith.length > 0).length > 0 && (
              <Alert variant="warning" isInline title={t("down_modal.shared_networks_title")} style={{ marginTop: "1rem" }}>
                <ul style={{ margin: "0.25rem 0 0 1.25rem", padding: 0 }}>
                  {downSharedNetworks.filter(n => n.sharedWith.length > 0).map(n => (
                    <li key={n.name}>
                      <code>{n.name}</code>
                      {" — "}{t("down_modal.shared_with")}{" "}
                      <strong>{n.sharedWith.join(", ")}</strong>
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            {downError && (
              <Alert variant="danger" isInline title={downError} style={{ marginTop: "1rem" }} />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" icon={<TimesCircleIcon />} onClick={() => void performDown()} isLoading={downing}>
              {t("down_modal.confirm_button")}
            </Button>
            <Button variant="link" onClick={closeDown} isDisabled={downing}>
              {t("common.cancel")}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {killTarget && (
        <Modal
          isOpen
          variant="small"
          onClose={() => { if (!killing) closeKill(); }}
          aria-label={t("kill_modal.aria_label")}
        >
          <ModalHeader title={t("kill_modal.title", { name: killTarget.Name })} />
          <ModalBody>
            <p>
              {t("kill_modal.body_prefix")} <code>docker compose kill</code>{" "}
              {t("kill_modal.body_sigkill")} <strong>{killTarget.Name}</strong>{t("kill_modal.body_suffix")}
            </p>
            {killError && (
              <Alert variant="danger" isInline title={killError} style={{ marginTop: "1rem" }} />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" icon={<BanIcon />} onClick={() => void performKill()} isLoading={killing}>
              {t("kill_modal.confirm_button")}
            </Button>
            <Button variant="link" onClick={closeKill} isDisabled={killing}>
              {t("common.cancel")}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
