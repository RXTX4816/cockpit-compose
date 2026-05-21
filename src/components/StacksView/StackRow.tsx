import { useState, useCallback, useEffect, useRef } from "react";
import {
  DataListItem,
  DataListItemRow,
  DataListToggle,
  DataListItemCells,
  DataListCell,
  DataListContent,
  Label,
  Alert,
  Button,
  Dropdown,
  DropdownList,
  DropdownItem,
  MenuToggle,
  Divider,
  Spinner,
} from "@patternfly/react-core";
import {
  type ComposeStack,
  type ComposeContainer,
  type StackStatus,
  parseStackStatus,
  parseServiceCount,
  parseJsonOutput,
  getHealthStatus,
  listContainers,
  readComposeFile,
  getServicesFromCompose,
} from "../../api";
import { useStackActions } from "../../hooks/useStackActions";
import { StatusLabel } from "./StatusLabel";
import { StatsCell } from "./StatsCell";
import { ContainerTable } from "./ContainerTable";

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

export function StackRow({ stack, expanded, onToggle, onLogs, onYaml, onInfo, onDown, onPull, onActingChange }: StackRowProps) {
  const [containers, setContainers] = useState<ComposeContainer[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const cachedServiceNamesRef = useRef<string[]>([]);
  const prevParsedStatusRef = useRef<StackStatus>("unknown");

  const status = parseStackStatus(stack.Status);
  const health = getHealthStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFile = stack.ConfigFiles.split(",")[0].trim();

  const { acting, actionError, doAction } = useStackActions(stack.Name, configFile, onActingChange);

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

  // Clear stale container state when the stack's status changes
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
                  onClick={() => void doAction("start", async () => { setContainers([]); if (expanded) await loadContainers(); })}
                  isLoading={acting}
                  isDisabled={acting}
                >
                  ↑ Up
                </Button>

                {(status === "running" || status === "partial") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void doAction("stop", async () => { setContainers([]); if (expanded) await loadContainers(); })}
                    isLoading={acting}
                    isDisabled={acting}
                  >
                    ■ Stop
                  </Button>
                )}

                <Button variant="plain" size="sm" onClick={onLogs} title="View logs">
                  Logs
                </Button>

                <Button variant="plain" size="sm" onClick={onYaml} isDisabled={acting} title="Edit compose file">
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
                      onClick={() => {
                        setMenuOpen(false);
                        void doAction("restart", async () => { setContainers([]); if (expanded) await loadContainers(); });
                      }}
                    >
                      Restart
                    </DropdownItem>
                    <DropdownItem key="pull" onClick={() => { setMenuOpen(false); onPull(); }}>
                      Pull latest images
                    </DropdownItem>
                    <Divider key="div1" component="li" />
                    <DropdownItem key="info" onClick={() => { setMenuOpen(false); onInfo(); }}>
                      Info
                    </DropdownItem>
                    <Divider key="div2" component="li" />
                    <DropdownItem key="down" isDanger onClick={() => { setMenuOpen(false); onDown(); }}>
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
