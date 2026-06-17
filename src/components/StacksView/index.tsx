import { useState, useCallback, useMemo, useEffect } from "react";
import { useSharedNetworks } from "../../hooks/useSharedNetworks";
import { useTranslation } from "react-i18next";
import {
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateActions,
  EmptyStateFooter,
  DataList,
  Alert,
  Spinner,
} from "@patternfly/react-core";
import { type ComposeStack, type Runtime, parseStackStatus } from "../../api";
import { PlusCircleIcon, FolderOpenIcon } from "@patternfly/react-icons";
import { type DownedStack } from "../../hooks/useDownedStacksScan";
import { useComposeStacks } from "../../hooks/useComposeStacks";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { useDownStack } from "../../hooks/useDownStack";
import { useKillStack } from "../../hooks/useKillStack";
import { useModalTargets } from "../../hooks/useModalTargets";
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
import { DownModal } from "../DownModal";
import { KillModal } from "../KillModal";
import { DownedStacksSection } from "../DownedStacksSection";
import { StackRow } from "./StackRow";
import { StackSkeleton } from "./StackSkeleton";
import { StacksToolbar, type StatusFilter } from "./StacksToolbar";
import "./StacksView.css";
import { splitConfigFiles } from "../../lib/configFiles";

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
  const [activeOps, setActiveOps] = useState(0);
  const [runtimeSwitchKey, setRuntimeSwitchKey] = useState(0);

  const modals = useModalTargets();

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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of stacks) {
      const st = parseStackStatus(s.Status);
      counts[st] = (counts[st] ?? 0) + 1;
    }
    return counts;
  }, [stacks]);

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

  // Remove filters whose stack count has dropped to zero
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

  // Keyboard shortcuts: U=up, D=down, L=logs, E=edit, I=info — on focused row
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (document.activeElement as HTMLElement)?.isContentEditable) return;
      if (document.querySelector(".pf-v6-c-modal-box")) return;

      const key = e.key.toLowerCase();
      if (!["u", "d", "l", "e", "i"].includes(key)) return;

      const row = (document.activeElement as HTMLElement)?.closest("[data-stack-name]") as HTMLElement | null;
      const name = row?.dataset.stackName;
      if (!name) return;

      const stack = stacks.find(s => s.Name === name);
      if (!stack) return;

      e.preventDefault();
      if (key === "u") modals.setUpConfirmTarget(stack);
      else if (key === "d") openDown(stack);
      else if (key === "l") modals.setLogsTarget(stack);
      else if (key === "e") modals.setYamlTarget(stack);
      else if (key === "i") modals.setInfoTarget(stack);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stacks, openDown, modals]);

  return (
    <>
      <StacksToolbar
        stacks={stacks}
        statusCounts={statusCounts}
        activeFilters={activeFilters}
        searchTerm={searchTerm}
        onFilterToggle={toggleFilter}
        onSearchChange={setSearchTerm}
        onRuntimeChange={onRuntimeChange}
        onReset={() => { setRuntimeSwitchKey(k => k + 1); reset(); }}
        dockerMissing={dockerMissing}
      />

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
              onLogs={() => modals.setLogsTarget(stack)}
              onYaml={() => modals.setYamlTarget(stack)}
              onInfo={() => modals.setInfoTarget(stack)}
              onDown={() => openDown(stack)}
              onKill={() => openKill(stack)}
              onUp={() => modals.setUpConfirmTarget(stack)}
              onPull={() => modals.setPullConfirmTarget(stack)}
              onEvents={() => modals.setEventsTarget(stack)}
              onTop={() => modals.setTopTarget(stack)}
              onExec={() => modals.setExecTarget(stack)}
              onRun={() => modals.setRunTarget(stack)}
              onPrune={() => modals.setPruneTarget(stack)}
              onBackup={() => modals.setBackupTarget(stack)}
              onScale={() => modals.setScaleTarget(stack)}
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

      {modals.logsTarget && <LogsModal stack={modals.logsTarget} onClose={() => modals.setLogsTarget(null)} />}
      {modals.yamlTarget && (
        <YamlModal
          stack={modals.yamlTarget}
          onClose={() => modals.setYamlTarget(null)}
          onFileAdded={(newPath) => {
            modals.setYamlTarget(prev => prev ? { ...prev, ConfigFiles: [prev.ConfigFiles, newPath].join(",") } : null);
          }}
          onFileRemoved={(removedPath) => {
            modals.setYamlTarget(prev => prev
              ? { ...prev, ConfigFiles: prev.ConfigFiles.split(",").map(f => f.trim()).filter(f => f !== removedPath).join(",") }
              : null
            );
          }}
        />
      )}
      {modals.infoTarget && <StackInfoModal stack={modals.infoTarget} onClose={() => modals.setInfoTarget(null)} />}
      {modals.upConfirmTarget && (
        <UpConfirmModal
          stack={modals.upConfirmTarget}
          onConfirm={(profiles) => {
            modals.setUpTargetProfiles(profiles);
            modals.setUpTarget(modals.upConfirmTarget);
            modals.setUpConfirmTarget(null);
          }}
          onClose={() => modals.setUpConfirmTarget(null)}
        />
      )}
      {modals.upTarget && (
        <UpModal
          stack={modals.upTarget}
          profiles={modals.upTargetProfiles}
          onClose={() => { modals.setUpTarget(null); void refresh(); }}
        />
      )}
      {modals.pullConfirmTarget && (
        <PullConfirmModal
          stack={modals.pullConfirmTarget}
          onConfirm={() => { modals.setPullTarget(modals.pullConfirmTarget); modals.setPullConfirmTarget(null); }}
          onClose={() => modals.setPullConfirmTarget(null)}
        />
      )}
      {modals.pullTarget && <PullModal stack={modals.pullTarget} onClose={() => modals.setPullTarget(null)} />}
      {modals.eventsTarget && <EventsModal stack={modals.eventsTarget} onClose={() => modals.setEventsTarget(null)} />}
      {modals.topTarget && <TopModal stack={modals.topTarget} onClose={() => modals.setTopTarget(null)} />}
      {modals.execTarget && <ExecModal stack={modals.execTarget} onClose={() => modals.setExecTarget(null)} />}
      {modals.runTarget && <RunModal stack={modals.runTarget} onClose={() => modals.setRunTarget(null)} />}
      {modals.pruneTarget && (
        <PruneModal
          stack={modals.pruneTarget}
          onClose={() => modals.setPruneTarget(null)}
          onSuccess={refresh}
        />
      )}
      {modals.backupTarget && (
        <BackupModal stack={modals.backupTarget} onClose={() => modals.setBackupTarget(null)} />
      )}
      {modals.scaleTarget && (
        <ScaleModal stack={modals.scaleTarget} onClose={() => modals.setScaleTarget(null)} onSuccess={refresh} />
      )}

      {downTarget && (
        <DownModal
          target={downTarget}
          downing={downing}
          error={downError}
          sharedNetworks={downSharedNetworks}
          networksLoading={downNetworksLoading}
          onConfirm={() => void performDown()}
          onClose={closeDown}
        />
      )}

      {killTarget && (
        <KillModal
          target={killTarget}
          killing={killing}
          error={killError}
          onConfirm={() => void performKill()}
          onClose={closeKill}
        />
      )}
    </>
  );
}
