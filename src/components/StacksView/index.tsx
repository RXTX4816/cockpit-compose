import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Title,
  Button,
  Spinner,
  EmptyState,
  EmptyStateBody,
  DataList,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@patternfly/react-core";
import { type ComposeStack } from "../../api";
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
import { PruneModal } from "../PruneModal";
import { DownedStacksSection } from "../DownedStacksSection";
import { StackRow } from "./StackRow";
import "./StacksView.css";

export function StacksView() {
  const { t } = useTranslation();
  const { stacks, loading, error, refresh } = useComposeStacks();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [manuallyDownedStacks, setManuallyDownedStacks] = useState<DownedStack[]>([]);
  const [logsTarget, setLogsTarget] = useState<ComposeStack | null>(null);
  const [yamlTarget, setYamlTarget] = useState<ComposeStack | null>(null);
  const [infoTarget, setInfoTarget] = useState<ComposeStack | null>(null);
  const [upConfirmTarget, setUpConfirmTarget] = useState<ComposeStack | null>(null);
  const [upTarget, setUpTarget] = useState<ComposeStack | null>(null);
  const [pullConfirmTarget, setPullConfirmTarget] = useState<ComposeStack | null>(null);
  const [pullTarget, setPullTarget] = useState<ComposeStack | null>(null);
  const [eventsTarget, setEventsTarget] = useState<ComposeStack | null>(null);
  const [topTarget, setTopTarget] = useState<ComposeStack | null>(null);
  const [execTarget, setExecTarget] = useState<ComposeStack | null>(null);
  const [pruneTarget, setPruneTarget] = useState<ComposeStack | null>(null);
  // Counts how many stack actions are currently in flight.
  // We pause the auto-refresh while any action is running so that Docker
  // being temporarily busy (e.g. mid-restart) never causes a spurious error.
  const [activeOps, setActiveOps] = useState(0);

  const onActingChange = useCallback((delta: 1 | -1) => {
    setActiveOps(n => Math.max(0, n + delta));
  }, []);

  const handleDownComplete = useCallback((stack: ComposeStack) => {
    const configFile = stack.ConfigFiles.split(",")[0].trim();
    setManuallyDownedStacks(prev =>
      prev.some(d => d.name.toLowerCase() === stack.Name.toLowerCase())
        ? prev
        : [...prev, { name: stack.Name, configFile }]
    );
  }, []);

  const handleUpComplete = useCallback((name: string) => {
    setManuallyDownedStacks(prev => prev.filter(d => d.name.toLowerCase() !== name.toLowerCase()));
  }, []);

  const { target: downTarget, downing, error: downError, open: openDown, close: closeDown, execute: performDown }
    = useDownStack(refresh, onActingChange, handleDownComplete);

  const { target: killTarget, killing, error: killError, open: openKill, close: closeKill, execute: performKill }
    = useKillStack(refresh, onActingChange);

  const toggle = useCallback((name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  // Pause completely while Docker is busy with an action.
  // Keep polling (at a slower rate) even when error is set so the UI
  // auto-recovers without requiring a manual Retry click.
  useAutoRefresh(refresh, error ? 2000 : 500, activeOps > 0);

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Title headingLevel="h2">{t("stacks.title")}</Title>
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
        <div className="sv-loading">
          <Spinner />
        </div>
      ) : stacks.length === 0 ? (
        <EmptyState headingLevel="h3" titleText={t("stacks.empty_title")}>
          <EmptyStateBody>
            {t("stacks.empty_body")}
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <DataList aria-label={t("stacks.aria_label")} isCompact>
          {stacks.map(stack => (
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
              onPrune={() => setPruneTarget(stack)}
              onActingChange={onActingChange}
            />
          ))}
        </DataList>
      ))}

      <DownedStacksSection
        stacks={stacks}
        manuallyDownedStacks={manuallyDownedStacks}
        onRefresh={refresh}
        onUpComplete={handleUpComplete}
      />

      {logsTarget && <LogsModal stack={logsTarget} onClose={() => setLogsTarget(null)} />}
      {yamlTarget && <YamlModal stack={yamlTarget} onClose={() => setYamlTarget(null)} />}
      {infoTarget && <StackInfoModal stack={infoTarget} onClose={() => setInfoTarget(null)} />}
      {upConfirmTarget && (
        <UpConfirmModal
          stack={upConfirmTarget}
          onConfirm={() => { setUpTarget(upConfirmTarget); setUpConfirmTarget(null); }}
          onClose={() => setUpConfirmTarget(null)}
        />
      )}
      {upTarget && (
        <UpModal
          stack={upTarget}
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
      {pruneTarget && (
        <PruneModal
          stack={pruneTarget}
          onClose={() => setPruneTarget(null)}
          onSuccess={refresh}
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
            {downError && (
              <Alert variant="danger" isInline title={downError} style={{ marginTop: "1rem" }} />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={() => void performDown()} isLoading={downing}>
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
            <Button variant="danger" onClick={() => void performKill()} isLoading={killing}>
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
