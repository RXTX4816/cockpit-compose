import { useState, useCallback } from "react";
import { useSharedNetworks } from "../../hooks/useSharedNetworks";
import { useTranslation } from "react-i18next";
import { useModalState } from "../../hooks/useModalState";
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
  Tooltip,
  Spinner,
} from "@patternfly/react-core";
import { type ComposeStack, type Runtime } from "../../api";
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

const filterColorMap: Record<string, "green" | "orange" | "grey" | "blue"> = {
  running: "green",
  partial: "orange",
  stopped: "grey",
  paused: "blue",
};

interface Props {
  onRuntimeChange?: (runtime: Runtime) => void;
  dockerMissing?: boolean;
}

export function StacksView({ onRuntimeChange, dockerMissing }: Props) {
  const { t } = useTranslation();
  const { stacks, loading, error, refresh, reset } = useComposeStacks();
  const [manuallyDownedStacks, setManuallyDownedStacks] = useState<DownedStack[]>([]);
  const [runtimeSwitchKey, setRuntimeSwitchKey] = useState(0);

  // Extracted hooks
  const modals = useModalState();
  const { expanded, toggleExpanded } = useExpandedStacks();
  const { activeOps, increment, decrement } = useOperationCounter();
  const {
    searchTerm, setSearchTerm, activeFilters, toggleFilter,
    filteredStacks: displayedStacks, statusCounts, STATUS_FILTER_OPTIONS, clearFilters,
  } = useStackFilters(stacks);

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

      {modals.state.logs && <LogsModal stack={modals.state.logs} onClose={() => modals.close("logs")} />}
      {modals.state.yaml && (
        <YamlModal
          stack={modals.state.yaml}
          onClose={() => modals.close("yaml")}
          onFileAdded={(newPath) => {
            const prev = modals.state.yaml;
            if (prev) modals.open("yaml", { ...prev, ConfigFiles: [prev.ConfigFiles, newPath].join(",") });
          }}
          onFileRemoved={(removedPath) => {
            const prev = modals.state.yaml;
            if (prev) modals.open("yaml", { ...prev, ConfigFiles: prev.ConfigFiles.split(",").map(f => f.trim()).filter(f => f !== removedPath).join(",") });
          }}
        />
      )}
      {modals.state.info && <StackInfoModal stack={modals.state.info} onClose={() => modals.close("info")} />}
      {modals.state.upConfirm && (
        <UpConfirmModal
          stack={modals.state.upConfirm}
          onConfirm={(profiles) => {
            modals.dispatch({ type: "setProfiles", profiles });
            modals.transition("upConfirm", "up");
          }}
          onClose={() => modals.close("upConfirm")}
        />
      )}
      {modals.state.up && (
        <UpModal
          stack={modals.state.up}
          profiles={modals.state.upProfiles}
          onClose={() => { modals.close("up"); void refresh(); }}
        />
      )}
      {modals.state.pullConfirm && (
        <PullConfirmModal
          stack={modals.state.pullConfirm}
          onConfirm={() => modals.transition("pullConfirm", "pull")}
          onClose={() => modals.close("pullConfirm")}
        />
      )}
      {modals.state.pull && <PullModal stack={modals.state.pull} onClose={() => modals.close("pull")} />}
      {modals.state.events && <EventsModal stack={modals.state.events} onClose={() => modals.close("events")} />}
      {modals.state.top && <TopModal stack={modals.state.top} onClose={() => modals.close("top")} />}
      {modals.state.exec && <ExecModal stack={modals.state.exec} onClose={() => modals.close("exec")} />}
      {modals.state.run && <RunModal stack={modals.state.run} onClose={() => modals.close("run")} />}
      {modals.state.prune && (
        <PruneModal
          stack={modals.state.prune}
          onClose={() => modals.close("prune")}
          onSuccess={refresh}
        />
      )}
      {modals.state.backup && (
        <BackupModal stack={modals.state.backup} onClose={() => modals.close("backup")} />
      )}
      {modals.state.scale && (
        <ScaleModal stack={modals.state.scale} onClose={() => modals.close("scale")} onSuccess={refresh} />
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
