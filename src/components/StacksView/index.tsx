import { useState, useCallback, useEffect } from "react";
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
import { type ComposeStack, downStack } from "../../api";
import { useComposeStacks } from "../../hooks/useComposeStacks";
import { LogsModal } from "../LogsModal";
import { YamlModal } from "../YamlModal";
import { StackInfoModal } from "../StackInfoModal";
import { PullModal } from "../PullModal";
import { StackRow } from "./StackRow";

export function StacksView() {
  const { stacks, loading, error, refresh } = useComposeStacks();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [logsTarget, setLogsTarget] = useState<ComposeStack | null>(null);
  const [yamlTarget, setYamlTarget] = useState<ComposeStack | null>(null);
  const [infoTarget, setInfoTarget] = useState<ComposeStack | null>(null);
  const [downTarget, setDownTarget] = useState<ComposeStack | null>(null);
  const [downing, setDowning] = useState(false);
  const [downError, setDownError] = useState<string | null>(null);
  const [pullTarget, setPullTarget] = useState<ComposeStack | null>(null);
  // Counts how many stack actions are currently in flight.
  // We pause the auto-refresh while any action is running so that Docker
  // being temporarily busy (e.g. mid-restart) never causes a spurious error.
  const [activeOps, setActiveOps] = useState(0);

  const onActingChange = useCallback((delta: 1 | -1) => {
    setActiveOps(n => Math.max(0, n + delta));
  }, []);

  const toggle = useCallback((name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  useEffect(() => {
    // Pause completely while Docker is busy with an action.
    // Keep polling (at a slower rate) even when error is set so the UI
    // auto-recovers without requiring a manual Retry click.
    if (activeOps > 0) return;
    const interval = setInterval(refresh, error ? 2000 : 500);
    return () => clearInterval(interval);
  }, [refresh, error, activeOps]);

  const performDown = async () => {
    if (!downTarget) return;
    const configFile = downTarget.ConfigFiles.split(",")[0].trim();
    setDowning(true);
    setActiveOps(n => n + 1);
    setDownError(null);
    try {
      await downStack(downTarget.Name, configFile);
      setDownTarget(null);
      refresh();
    } catch (ex: unknown) {
      setDownError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setDowning(false);
      setActiveOps(n => Math.max(0, n - 1));
    }
  };

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
        <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
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
              onDown={() => { setDownError(null); setDownTarget(stack); }}
              onPull={() => setPullTarget(stack)}
              onActingChange={onActingChange}
            />
          ))}
        </DataList>
      ))}

      {logsTarget && <LogsModal stack={logsTarget} onClose={() => setLogsTarget(null)} />}
      {yamlTarget && <YamlModal stack={yamlTarget} onClose={() => setYamlTarget(null)} />}
      {infoTarget && <StackInfoModal stack={infoTarget} onClose={() => setInfoTarget(null)} />}
      {pullTarget && <PullModal stack={pullTarget} onClose={() => setPullTarget(null)} />}

      {downTarget && (
        <Modal
          isOpen
          variant="small"
          onClose={() => { if (!downing) { setDownTarget(null); setDownError(null); } }}
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
            <Button variant="link" onClick={() => { setDownTarget(null); setDownError(null); }} isDisabled={downing}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
