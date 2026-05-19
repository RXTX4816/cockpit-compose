import { useState, useCallback, useEffect, useRef } from "react";
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
  DataListItem,
  DataListItemRow,
  DataListToggle,
  DataListItemCells,
  DataListCell,
  DataListContent,
  Label,
  Alert,
  Dropdown,
  DropdownList,
  DropdownItem,
  MenuToggle,
  Divider,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@patternfly/react-core";
import {
  type ComposeStack,
  type ComposeContainer,
  type ContainerStats,
  type StackStatus,
  parseStackStatus,
  parseServiceCount,
  parseJsonOutput,
  getHealthStatus,
  listContainers,
  startStack,
  stopStack,
  restartStack,
  downStack,
  readComposeFile,
  getServicesFromCompose,
  getContainerStats,
  parsePorts,
} from "../api";
import { useComposeStacks } from "../hooks/useComposeStacks";
import { LogsModal } from "./LogsModal";
import { YamlModal } from "./YamlModal";
import { StackInfoModal } from "./StackInfoModal";
import { PullModal } from "./PullModal";
import { parseDockerBytes, formatBytes } from "../lib/bytes";

// --- StatusLabel ---

export function StatusLabel({ status }: { status: StackStatus }) {
  const cfg: Record<StackStatus, { color: "green" | "grey" | "orange"; text: string }> = {
    running: { color: "green", text: "running" },
    partial: { color: "orange", text: "partial" },
    down: { color: "grey", text: "stopped" },
    unknown: { color: "grey", text: "unknown" },
  };
  const { color, text } = cfg[status];
  return <Label color={color} isCompact>{text}</Label>;
}

// --- StatsCell ---

interface StatsCellProps {
  stackName: string;
  status: StackStatus;
}

function StatsCell({ stackName, status }: StatsCellProps) {
  const [ports, setPorts] = useState<string[]>([]);
  const [stats, setStats] = useState<{ cpu: number; mem: number } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (status === "down" || status === "unknown") {
      if (mountedRef.current) { setPorts([]); setStats(null); }
      return;
    }
    try {
      let raw = "";
      const proc = listContainers(stackName);
      proc.stream(d => { raw += d; });
      await proc;
      const containers = parseJsonOutput<ComposeContainer>(raw);

      const allPorts = new Set<string>();
      const runningIds: string[] = [];
      for (const c of containers) {
        for (const p of parsePorts(c.Ports)) allPorts.add(p);
        if (c.State?.toLowerCase() === "running" && c.ID) runningIds.push(c.ID);
      }
      if (mountedRef.current) setPorts([...allPorts]);

      if (runningIds.length > 0) {
        let statsRaw = "";
        const statsProc = getContainerStats(runningIds);
        statsProc.stream(d => { statsRaw += d; });
        await statsProc;
        const statsData = parseJsonOutput<ContainerStats>(statsRaw);

        let totalCPU = 0;
        let totalMem = 0;
        for (const s of statsData) {
          totalCPU += parseFloat(s.cpu || "0");
          const [used] = (s.mem || "0B / 0B").split(" / ");
          totalMem += parseDockerBytes(used);
        }
        if (mountedRef.current) setStats({ cpu: totalCPU, mem: totalMem });
      } else {
        if (mountedRef.current) setStats(null);
      }
    } catch {
      // Silently ignore — stats are best-effort
    }
  }, [stackName, status]);

  useEffect(() => {
    void load();
    if (status === "running" || status === "partial") {
      const t = setInterval(() => void load(), 10000);
      return () => clearInterval(t);
    }
  }, [load, status]);

  if (status === "down" || status === "unknown") {
    return (
      <span style={{ color: "var(--pf-t--global--text--color--subtle)", fontSize: "var(--pf-t--global--font--size--sm)" }}>—</span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {ports.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
          {ports.map(p => (
            <Label
              key={p}
              isCompact
              color="blue"
              style={{ fontFamily: "var(--pf-t--global--font--family--mono)", fontSize: "0.7rem" }}
            >
              {p}
            </Label>
          ))}
        </div>
      )}
      {stats && (
        <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "var(--pf-t--global--text--color--subtle)" }}>
          <span>CPU {stats.cpu.toFixed(1)}%</span>
          <span>Mem {formatBytes(stats.mem)}</span>
        </div>
      )}
      {ports.length === 0 && !stats && (
        <Spinner size="sm" />
      )}
    </div>
  );
}

// --- ContainerTable ---

export function ContainerTable({ containers }: { containers: ComposeContainer[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {containers.map(c => {
        const isRunning = c.State?.toLowerCase() === "running";
        return (
          <div
            key={c.ID || c.Name}
            style={{
              display: "grid",
              gridTemplateColumns: "7rem 10rem 1fr auto",
              gap: "0.75rem",
              alignItems: "center",
              padding: "0.35rem 0",
              borderTop: "1px solid var(--pf-t--global--border--color--default)",
              fontSize: "var(--pf-t--global--font--size--sm)",
            }}
          >
            <Label color={isRunning ? "green" : "grey"} isCompact>{c.State || "unknown"}</Label>
            <span style={{ fontWeight: 500 }}>{c.Service || c.Name}</span>
            <span style={{ color: "var(--pf-t--global--text--color--subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.Image}
            </span>
            <span style={{ color: "var(--pf-t--global--text--color--subtle)", textAlign: "right", whiteSpace: "nowrap" }}>
              {c.Status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// --- StackRow ---

interface StackRowProps {
  stack: ComposeStack;
  expanded: boolean;
  onToggle: () => void;
  onLogs: () => void;
  onYaml: () => void;
  onInfo: () => void;
  onDown: () => void;
  onPull: () => void;
  onActingChange: (delta: 1 | -1) => void;
}

function StackRow({ stack, expanded, onToggle, onLogs, onYaml, onInfo, onDown, onPull, onActingChange }: StackRowProps) {
  const [containers, setContainers] = useState<ComposeContainer[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const cachedServiceNamesRef = useRef<string[]>([]);
  const prevParsedStatusRef = useRef<StackStatus>("unknown");

  const status = parseStackStatus(stack.Status);
  const health = getHealthStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFile = stack.ConfigFiles.split(",")[0].trim();

  const loadContainers = useCallback(async () => {
    setLoadingContainers(true);
    try {
      let raw = "";
      const proc = listContainers(stack.Name);
      proc.stream(d => { raw += d; });
      await proc;
      const running = parseJsonOutput<ComposeContainer>(raw);

      let composeContent = "";
      const cp = readComposeFile(configFile);
      cp.stream(d => { composeContent += d; });
      await cp;
      const serviceNames = getServicesFromCompose(composeContent);
      cachedServiceNamesRef.current = serviceNames;

      setContainers(serviceNames.map(name => {
        const c = running.find(r => r.Service === name);
        return c ?? { ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name };
      }));
    } catch {
      try {
        let composeContent = "";
        const cp2 = readComposeFile(configFile);
        cp2.stream(d => { composeContent += d; });
        await cp2;
        const serviceNames = getServicesFromCompose(composeContent);
        cachedServiceNamesRef.current = serviceNames;
        setContainers(serviceNames.map(name => ({
          ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name,
        })));
      } catch {
        const cached = cachedServiceNamesRef.current;
        setContainers(cached.length > 0
          ? cached.map(name => ({ ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name }))
          : []);
      }
    } finally {
      setLoadingContainers(false);
    }
  }, [stack.Name, configFile]);

  // Bug fix: clear stale container state when the stack's status changes
  useEffect(() => {
    if (prevParsedStatusRef.current !== status) {
      prevParsedStatusRef.current = status;
      setContainers([]);
    }
  }, [status]);

  const handleToggle = () => {
    onToggle();
    if (!expanded && containers.length === 0) {
      void loadContainers();
    }
  };

  const doAction = async (action: "start" | "stop" | "restart") => {
    setActing(true);
    onActingChange(1);
    setActionError(null);
    try {
      if (action === "start") await startStack(stack.Name, configFile);
      else if (action === "stop") await stopStack(stack.Name, configFile);
      else await restartStack(stack.Name, configFile);

      // Always clear after action — prevents stale data on next expand
      setContainers([]);
      if (expanded) await loadContainers();
    } catch (ex: unknown) {
      setActionError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setActing(false);
      onActingChange(-1);
    }
  };

  return (
    <DataListItem isExpanded={expanded} aria-labelledby={`stack-${stack.Name}`}>
      <DataListItemRow>
        <DataListToggle
          onClick={handleToggle}
          isExpanded={expanded}
          id={`toggle-${stack.Name}`}
          aria-controls={`expand-${stack.Name}`}
        />
        <DataListItemCells
          dataListCells={[
            <DataListCell key="name" width={2}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                <StatusLabel status={status} />
                <Label
                  color={health === "healthy" ? "green" : health === "partial" ? "orange" : "grey"}
                  isCompact
                >
                  {health === "healthy" ? "✓ Healthy" : health === "partial" ? "⚠ Partial" : "✗ Unhealthy"}
                </Label>
                <span id={`stack-${stack.Name}`} style={{ fontWeight: 600 }}>
                  {stack.Name}
                </span>
              </span>
            </DataListCell>,

            <DataListCell key="services" width={1}>
              <span style={{ color: "var(--pf-t--global--text--color--subtle)", fontSize: "var(--pf-t--global--font--size--sm)" }}>
                {count} {count === 1 ? "service" : "services"}
              </span>
            </DataListCell>,

            <DataListCell key="stats" width={3}>
              <StatsCell stackName={stack.Name} status={status} />
            </DataListCell>,

            <DataListCell key="actions" width={2} alignRight>
              <span style={{ display: "flex", gap: "0.35rem", flexWrap: "nowrap", justifyContent: "flex-end", alignItems: "center" }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void doAction("start")}
                  isLoading={acting}
                  isDisabled={acting}
                >
                  ↑ Up
                </Button>

                {(status === "running" || status === "partial") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void doAction("stop")}
                    isLoading={acting}
                    isDisabled={acting}
                  >
                    ■ Stop
                  </Button>
                )}

                <Button
                  variant="plain"
                  size="sm"
                  onClick={onLogs}
                  title="View logs"
                >
                  Logs
                </Button>

                <Button
                  variant="plain"
                  size="sm"
                  onClick={onYaml}
                  isDisabled={acting}
                  title="Edit compose file"
                >
                  Edit
                </Button>

                <Dropdown
                  isOpen={menuOpen}
                  onOpenChange={(o: boolean) => setMenuOpen(o)}
                  toggle={(ref) => (
                    <MenuToggle
                      ref={ref}
                      variant="plain"
                      onClick={() => setMenuOpen(o => !o)}
                      aria-label={`More actions for ${stack.Name}`}
                      isDisabled={acting}
                    >
                      ⋮
                    </MenuToggle>
                  )}
                  popperProps={{ position: "right" }}
                >
                  <DropdownList>
                    <DropdownItem
                      key="restart"
                      isDisabled={status === "down" || status === "unknown"}
                      onClick={() => { setMenuOpen(false); void doAction("restart"); }}
                    >
                      Restart
                    </DropdownItem>
                    <DropdownItem
                      key="pull"
                      onClick={() => { setMenuOpen(false); onPull(); }}
                    >
                      Pull latest images
                    </DropdownItem>
                    <Divider key="div1" component="li" />
                    <DropdownItem
                      key="info"
                      onClick={() => { setMenuOpen(false); onInfo(); }}
                    >
                      Info
                    </DropdownItem>
                    <Divider key="div2" component="li" />
                    <DropdownItem
                      key="down"
                      isDanger
                      onClick={() => { setMenuOpen(false); onDown(); }}
                    >
                      Down (remove)
                    </DropdownItem>
                  </DropdownList>
                </Dropdown>
              </span>
            </DataListCell>,
          ]}
        />
      </DataListItemRow>

      {actionError && (
        <Alert variant="danger" isInline title={actionError} style={{ margin: "0 1rem 0.5rem" }} />
      )}

      <DataListContent
        aria-label={`${stack.Name} containers`}
        id={`expand-${stack.Name}`}
        isHidden={!expanded}
        hasNoPadding
      >
        <div style={{ padding: "0.75rem 1rem 1rem 3.5rem" }}>
          {loadingContainers ? (
            <Spinner size="md" />
          ) : containers.length === 0 ? (
            <span style={{ color: "var(--pf-t--global--text--color--subtle)", fontSize: "var(--pf-t--global--font--size--sm)" }}>
              No containers found.
            </span>
          ) : (
            <ContainerTable containers={containers} />
          )}
        </div>
      </DataListContent>
    </DataListItem>
  );
}

// --- StacksView ---

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
