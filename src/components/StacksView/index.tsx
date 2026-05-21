import { useState, useCallback } from "react";
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
import { StackRow } from "./StackRow";
import "./StacksView.css";

export function StacksView() {
  const { stacks, loading, error, refresh } = useComposeStacks();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  const { target: downTarget, downing, error: downError, open: openDown, close: closeDown, execute: performDown }
    = useDownStack(refresh, onActingChange);

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
            <Title headingLevel="h2">Compose Stacks</Title>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {error && (
        <Alert
          variant="danger"
          isInline
          title="Failed to load stacks"
          style={{ marginBottom: "1rem" }}
          actionLinks={<Button variant="link" size="sm" onClick={refresh}>Retry</Button>}
        >
          {error}
        </Alert>
      )}

      {!error && (loading && stacks.length === 0 ? (
        <div className="sv-loading">
          <Spinner />
        </div>
      ) : stacks.length === 0 ? (
        <EmptyState headingLevel="h3" titleText="No compose stacks found">
          <EmptyStateBody>
            Start a project with <code>docker compose up -d</code> and it will appear here.
          </EmptyStateBody>
        </EmptyState>
      ) : (
        <DataList aria-label="Compose stacks" isCompact>
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
          aria-label="Confirm down"
        >
          <ModalHeader title={`Remove "${downTarget.Name}"?`} />
          <ModalBody>
            <p>
              Running <code>docker compose down</code> will stop and remove all containers for{" "}
              <strong>{downTarget.Name}</strong>. The stack will disappear from this list.
            </p>
            {downError && (
              <Alert variant="danger" isInline title={downError} style={{ marginTop: "1rem" }} />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={() => void performDown()} isLoading={downing}>
              Down (remove)
            </Button>
            <Button variant="link" onClick={closeDown} isDisabled={downing}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {killTarget && (
        <Modal
          isOpen
          variant="small"
          onClose={() => { if (!killing) closeKill(); }}
          aria-label="Confirm kill"
        >
          <ModalHeader title={`Kill "${killTarget.Name}"?`} />
          <ModalBody>
            <p>
              Running <code>docker compose kill</code> sends <strong>SIGKILL</strong> to all containers
              in <strong>{killTarget.Name}</strong>, forcefully terminating them immediately.
              Unlike Stop, processes have no chance to clean up. Use only when Stop does not respond.
            </p>
            {killError && (
              <Alert variant="danger" isInline title={killError} style={{ marginTop: "1rem" }} />
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={() => void performKill()} isLoading={killing}>
              Kill all containers
            </Button>
            <Button variant="link" onClick={closeKill} isDisabled={killing}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
