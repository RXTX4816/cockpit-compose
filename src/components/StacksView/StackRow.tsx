import { useState, useCallback } from "react";
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
  parseStackStatus,
  parseServiceCount,
  getHealthStatus,
} from "../../api";
import { useStackActions } from "../../hooks/useStackActions";
import { useStackContainers } from "../../hooks/useStackContainers";
import { StatusLabel } from "./StatusLabel";
import { StatsCell } from "./StatsCell";
import { ContainerTable } from "./ContainerTable";
import "./StackRow.css";

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
  const [menuOpen, setMenuOpen] = useState(false);

  const status = parseStackStatus(stack.Status);
  const health = getHealthStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFile = stack.ConfigFiles.split(",")[0].trim();

  const { acting, actionError, doAction } = useStackActions(stack.Name, configFile, onActingChange);
  const { containers, loading: loadingContainers, load: loadContainers, clear: clearContainers } = useStackContainers(stack.Name, configFile, status);

  const handleToggle = () => {
    onToggle();
    if (!expanded && containers.length === 0) {
      void loadContainers();
    }
  };

  const afterAction = useCallback(async () => {
    clearContainers();
    if (expanded) await loadContainers();
  }, [clearContainers, expanded, loadContainers]);

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
              <span className="sr-name-cell">
                <StatusLabel status={status} />
                <Label
                  color={health === "healthy" ? "green" : health === "partial" ? "orange" : "grey"}
                  isCompact
                >
                  {health === "healthy" ? "✓ Healthy" : health === "partial" ? "⚠ Partial" : "✗ Unhealthy"}
                </Label>
                <span id={`stack-${stack.Name}`} className="sr-stack-name">
                  {stack.Name}
                </span>
              </span>
            </DataListCell>,

            <DataListCell key="services" width={1}>
              <span className="sr-services-count">
                {count} {count === 1 ? "service" : "services"}
              </span>
            </DataListCell>,

            <DataListCell key="stats" width={3}>
              <StatsCell stackName={stack.Name} status={status} />
            </DataListCell>,

            <DataListCell key="actions" width={2} alignRight>
              <span className="sr-actions-cell">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void doAction("start", afterAction)}
                  isLoading={acting}
                  isDisabled={acting}
                >
                  ↑ Up
                </Button>

                {(status === "running" || status === "partial") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void doAction("stop", afterAction)}
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
                      onClick={() => { setMenuOpen(false); void doAction("restart", afterAction); }}
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
        <div className="sr-containers-panel">
          {loadingContainers ? (
            <Spinner size="md" />
          ) : containers.length === 0 ? (
            <span className="sr-no-containers">No containers found.</span>
          ) : (
            <ContainerTable containers={containers} />
          )}
        </div>
      </DataListContent>
    </DataListItem>
  );
}
