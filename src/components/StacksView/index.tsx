import { useState, useCallback, useMemo, useEffect } from "react";
import { useSharedNetworks } from "../../hooks/useSharedNetworks";
import { useTranslation } from "react-i18next";
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
  Tooltip,
  Spinner,
} from "@patternfly/react-core";
import { type ComposeStack, type Runtime, parseStackStatus } from "../../api";
import { TimesCircleIcon, BanIcon, PlusCircleIcon, FolderOpenIcon } from "@patternfly/react-icons";
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
import { StackRow } from "./StackRow";
import { RuntimeToggle } from "../RuntimeToggle";
import { StackSkeleton } from "./StackSkeleton";
import "./StacksView.css";
import { splitConfigFiles } from "../../lib/configFiles";

const STATUS_FILTER_OPTIONS = ["running", "partial", "stopped", "paused"] as const;
type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

const EXPANDED_KEY = "cockpit-compose:expanded";

function loadExpandedFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveExpandedToStorage(expanded: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  } catch { /* ignore */ }
}

interface Props {
  onRuntimeChange?: (runtime: Runtime) => void;
  dockerMissing?: boolean;
}

export function StacksView({ onRuntimeChange, dockerMissing }: Props) {
  const { t } = useTranslation();
  const { stacks, loading, error, refresh, reset } = useComposeStacks();
  const [expanded, setExpanded] = useState<Set<string>>(loadExpandedFromStorage);
  const [manuallyDownedStacks, setManuallyDownedStacks] = useState<DownedStack[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<StatusFilter>>(new Set());

  const [logsTarget, setLogsTarget] = useState<ComposeStack | null>(null);
  const [yamlTarget, setYamlTarget] = useState<ComposeStack | null>(null);
  const [infoTarget, setInfoTarget] = useState<ComposeStack | null>(null);
  const [upConfirmTarget, setUpConfirmTarget] = useState<ComposeStack | null>(null);
  const [upTarget, setUpTarget] = useState<ComposeStack | null>(null);
  const [upTargetProfiles, setUpTargetProfiles] = useState<string[]>([]);
  const [pullConfirmTarget, setPullConfirmTarget] = useState<ComposeStack | null>(null);
  const [pullTarget, setPullTarget] = useState<ComposeStack | null>(null);
  const [eventsTarget, setEventsTarget] = useState<ComposeStack | null>(null);
  const [topTarget, setTopTarget] = useState<ComposeStack | null>(null);
  const [execTarget, setExecTarget] = useState<ComposeStack | null>(null);
  const [runTarget, setRunTarget] = useState<ComposeStack | null>(null);
  const [pruneTarget, setPruneTarget] = useState<ComposeStack | null>(null);
  const [backupTarget, setBackupTarget] = useState<ComposeStack | null>(null);
  const [scaleTarget, setScaleTarget] = useState<ComposeStack | null>(null);
  const [activeOps, setActiveOps] = useState(0);
  const [runtimeSwitchKey, setRuntimeSwitchKey] = useState(0);

  const onActingChange = useCallback((delta: 1 | -1) => {
    setActiveOps(n => Math.max(0, n + delta));
  }, []);

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

  const { target: downTarget, downing, error: downError, open: openDown, close: closeDown, execute: performDown }
    = useDownStack(refresh, onActingChange, handleDownComplete);

  const { target: killTarget, killing, error: killError, open: openKill, close: closeKill, execute: performKill }
    = useKillStack(refresh, onActingChange);

  const { sharedNetworks: downSharedNetworks, loading: downNetworksLoading } =
    useSharedNetworks(downTarget?.Name ?? "", downTarget !== null);

  const toggle = useCallback((name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveExpandedToStorage(next);
      return next;
    });
  }, []);

  useAutoRefresh(refresh, error ? 2000 : 500, activeOps > 0);

  // Status counts for badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of stacks) {
      const st = parseStackStatus(s.Status);
      counts[st] = (counts[st] ?? 0) + 1;
    }
    return counts;
  }, [stacks]);

  // Filter + search stacks
  const displayedStacks = useMemo(() => {
    let result = stacks;
    if (activeFilters.size > 0) {
      result = result.filter(s => activeFilters.has(parseStackStatus(s.Status) as StatusFilter));
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(s => s.Name.toLowerCase().includes(lower));
    }
    return result;
  }, [stacks, activeFilters, searchTerm]);

  // Remove filters whose stack count has dropped to zero (e.g. "partial" → "running" transition)
  useEffect(() => {
    setActiveFilters(prev => {
      const cleaned = new Set([...prev].filter(f => (statusCounts[f] ?? 0) > 0));
      return cleaned.size === prev.size ? prev : cleaned;
    });
  }, [statusCounts]);

  const toggleFilter = useCallback((filter: StatusFilter) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }, []);

  // Keyboard shortcuts: U=up, D=down, L=logs, E=edit, I=info — on the row currently focused
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      // Skip if a modal is open
      if (document.querySelector(".pf-v6-c-modal-box")) return;

      const key = e.key.toLowerCase();
      if (!["u", "d", "l", "e", "i"].includes(key)) return;

      // Find the stack row that contains the focused element
      const row = (document.activeElement as HTMLElement)?.closest("[data-stack-name]") as HTMLElement | null;
      const name = row?.dataset.stackName;
      if (!name) return;

      const stack = stacks.find(s => s.Name === name);
      if (!stack) return;

      e.preventDefault();
      if (key === "u") setUpConfirmTarget(stack);
      else if (key === "d") openDown(stack);
      else if (key === "l") setLogsTarget(stack);
      else if (key === "e") setYamlTarget(stack);
      else if (key === "i") setInfoTarget(stack);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stacks, openDown]);

  const filterColorMap: Record<StatusFilter, "green" | "orange" | "grey" | "blue"> = {
    running: "green",
    partial: "orange",
    stopped: "grey",
    paused: "blue",
  };

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
              <SearchInput
                className="sv-search"
                value={searchTerm}
                onChange={(_e, v) => setSearchTerm(v)}
                onClear={() => setSearchTerm("")}
                placeholder={t("stacks.search_placeholder")}
                aria-label={t("stacks.search_placeholder")}
              />
            </ToolbarItem>
          )}

          <ToolbarItem align={{ default: "alignEnd" }}>
            <RuntimeToggle onRuntimeChange={(r) => { setRuntimeSwitchKey(k => k + 1); reset(); onRuntimeChange?.(r); }} suggestPodman={dockerMissing} />
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
                  // Scroll down to trigger the DownedStacksSection create button
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
              <Button variant="link" onClick={() => { setSearchTerm(""); setActiveFilters(new Set()); }}>
                {t("stacks.clear_filters")}
              </Button>
            </EmptyStateActions>
          </EmptyStateFooter>
        </EmptyState>
      ) : (
        <DataList aria-label={t("stacks.aria_label")} isCompact>
          {displayedStacks.map(stack => (
            <StackRow
              key={stack.Name}
              stack={stack}
              expanded={expanded.has(stack.Name)}
              onToggle={() => toggle(stack.Name)}
              onLogs={() => setLogsTarget(stack)}
              onYaml={() => setYamlTarget(stack)}
              onInfo={() => setInfoTarget(stack)}
              onDown={() => openDown(stack)}
              onKill={() => openKill(stack)}
              onUp={() => setUpConfirmTarget(stack)}
              onPull={() => setPullConfirmTarget(stack)}
              onEvents={() => setEventsTarget(stack)}
              onTop={() => setTopTarget(stack)}
              onExec={() => setExecTarget(stack)}
              onRun={() => setRunTarget(stack)}
              onPrune={() => setPruneTarget(stack)}
              onBackup={() => setBackupTarget(stack)}
              onScale={() => setScaleTarget(stack)}
              onActingChange={onActingChange}
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
      />

      {logsTarget && <LogsModal stack={logsTarget} onClose={() => setLogsTarget(null)} />}
      {yamlTarget && (
        <YamlModal
          stack={yamlTarget}
          onClose={() => setYamlTarget(null)}
          onFileAdded={(newPath) => {
            setYamlTarget(prev => prev ? { ...prev, ConfigFiles: [prev.ConfigFiles, newPath].join(",") } : null);
          }}
          onFileRemoved={(removedPath) => {
            setYamlTarget(prev => prev
              ? { ...prev, ConfigFiles: prev.ConfigFiles.split(",").map(f => f.trim()).filter(f => f !== removedPath).join(",") }
              : null
            );
          }}
        />
      )}
      {infoTarget && <StackInfoModal stack={infoTarget} onClose={() => setInfoTarget(null)} />}
      {upConfirmTarget && (
        <UpConfirmModal
          stack={upConfirmTarget}
          onConfirm={(profiles) => {
            setUpTargetProfiles(profiles);
            setUpTarget(upConfirmTarget);
            setUpConfirmTarget(null);
          }}
          onClose={() => { setUpConfirmTarget(null); }}
        />
      )}
      {upTarget && (
        <UpModal
          stack={upTarget}
          profiles={upTargetProfiles}
          onClose={() => { setUpTarget(null); void refresh(); }}
        />
      )}
      {pullConfirmTarget && (
        <PullConfirmModal
          stack={pullConfirmTarget}
          onConfirm={() => { setPullTarget(pullConfirmTarget); setPullConfirmTarget(null); }}
          onClose={() => setPullConfirmTarget(null)}
        />
      )}
      {pullTarget && <PullModal stack={pullTarget} onClose={() => setPullTarget(null)} />}
      {eventsTarget && <EventsModal stack={eventsTarget} onClose={() => setEventsTarget(null)} />}
      {topTarget && <TopModal stack={topTarget} onClose={() => setTopTarget(null)} />}
      {execTarget && <ExecModal stack={execTarget} onClose={() => setExecTarget(null)} />}
      {runTarget && <RunModal stack={runTarget} onClose={() => setRunTarget(null)} />}
      {pruneTarget && (
        <PruneModal
          stack={pruneTarget}
          onClose={() => setPruneTarget(null)}
          onSuccess={refresh}
        />
      )}
      {backupTarget && (
        <BackupModal stack={backupTarget} onClose={() => setBackupTarget(null)} />
      )}
      {scaleTarget && (
        <ScaleModal stack={scaleTarget} onClose={() => setScaleTarget(null)} />
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
