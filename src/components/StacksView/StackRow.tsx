import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  DataListItem,
  DataListItemRow,
  DataListToggle,
  DataListItemCells,
  DataListCell,
  DataListContent,
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
  parseStackStatus,
  parseServiceCount,
} from "../../api";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@patternfly/react-icons";
import { useStackActions } from "../../hooks/useStackActions";
import { useStackContainers } from "../../hooks/useStackContainers";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { StatusLabel } from "./StatusLabel";
import { StatsCell } from "./StatsCell";
import { ContainerTable } from "./ContainerTable";
import "./StackRow.css";

function stackHealthSummary(containers: ComposeContainer[]): "healthy" | "unhealthy" | null {
  const withHealth = containers.filter(c => c.Health);
  if (withHealth.length === 0) return null;
  if (withHealth.some(c => c.Health!.toLowerCase() !== "healthy")) return "unhealthy";
  return "healthy";
}

interface StackRowProps {
  stack: ComposeStack;
  expanded: boolean;
  onToggle: () => void;
  onLogs: () => void;
  onYaml: () => void;
  onInfo: () => void;
  onDown: () => void;
  onKill: () => void;
  onUp: () => void;
  onPull: () => void;
  onEvents: () => void;
  onTop: () => void;
  onExec: () => void;
  onRun: () => void;
  onPrune: () => void;
  onActingChange: (delta: 1 | -1) => void;
}

export function StackRow({ stack, expanded, onToggle, onLogs, onYaml, onInfo, onDown, onKill, onUp, onPull, onEvents, onTop, onExec, onRun, onPrune, onActingChange }: StackRowProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const status = parseStackStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFile = stack.ConfigFiles.split(",")[0].trim();

  const { acting, actionError, doAction } = useStackActions(stack.Name, configFile, onActingChange);
  const { containers, loading: loadingContainers, load: loadContainers, clear: clearContainers } = useStackContainers(stack.Name, configFile, status);

  useEffect(() => { void loadContainers(); }, [loadContainers]);
  useAutoRefresh(loadContainers, 500, !expanded || acting);

  const handleToggle = () => {
    onToggle();
    if (!expanded) {
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
                {stackHealthSummary(containers) === "unhealthy" && (
                  <ExclamationTriangleIcon
                    color="var(--pf-t--global--icon--color--status--warning--default)"
                    title={t("health.failing")}
                  />
                )}
                {stackHealthSummary(containers) === "healthy" && (
                  <CheckCircleIcon
                    color="var(--pf-t--global--icon--color--status--success--default)"
                    title={t("health.passing")}
                  />
                )}
                <span id={`stack-${stack.Name}`} className="sr-stack-name">
                  {stack.Name}
                </span>
              </span>
            </DataListCell>,

            <DataListCell key="services" width={1}>
              <span className="sr-services-count">
                {t("stacks.service_count", { count })}
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
                  onClick={onUp}
                  isDisabled={acting}
                >
                  ↑ {t("actions.up")}
                </Button>

                {(status === "running" || status === "partial") ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void doAction("stop", afterAction)}
                    isLoading={acting}
                    isDisabled={acting}
                  >
                    ■ {t("actions.stop")}
                  </Button>
                ) : status === "stopped" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void doAction("start", afterAction)}
                    isLoading={acting}
                    isDisabled={acting}
                  >
                    ▶ {t("actions.start")}
                  </Button>
                )}

                <Button
                  variant="plain"
                  size="sm"
                  onClick={onDown}
                  isDisabled={acting}
                  className="sr-down-btn"
                  title={t("actions.down_title")}
                >
                  ↓ {t("actions.down")}
                </Button>

                <Button variant="plain" size="sm" onClick={onPull} title={t("actions.pull_title")}>
                  {t("actions.pull")}
                </Button>

                <Button variant="plain" size="sm" onClick={onLogs} title={t("actions.logs_title")}>
                  {t("actions.logs")}
                </Button>

                <Button variant="plain" size="sm" onClick={onYaml} isDisabled={acting} title={t("actions.edit_title")}>
                  {t("common.edit")}
                </Button>

                <Button variant="plain" size="sm" onClick={onInfo} title={t("actions.info_title")}>
                  {t("actions.info")}
                </Button>

                <Dropdown
                  isOpen={menuOpen}
                  onOpenChange={(o: boolean) => setMenuOpen(o)}
                  toggle={(ref) => (
                    <MenuToggle
                      ref={ref}
                      variant="plain"
                      onClick={() => setMenuOpen(o => !o)}
                      aria-label={t("actions.more_actions_for", { name: stack.Name })}
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
                      isDisabled={status === "stopped" || status === "unknown"}
                      onClick={() => { setMenuOpen(false); void doAction("restart", afterAction); }}
                    >
                      {t("actions.restart")}
                    </DropdownItem>
                    <DropdownItem
                      key="pause"
                      isDisabled={status === "stopped" || status === "unknown"}
                      onClick={() => {
                        setMenuOpen(false);
                        void doAction(status === "paused" ? "unpause" : "pause", afterAction);
                      }}
                    >
                      {status === "paused" ? t("actions.unpause") : t("actions.pause")}
                    </DropdownItem>
                    <DropdownItem key="events" onClick={() => { setMenuOpen(false); onEvents(); }}>
                      {t("actions.events")}
                    </DropdownItem>
                    <DropdownItem key="top" onClick={() => { setMenuOpen(false); onTop(); }}>
                      {t("actions.top")}
                    </DropdownItem>
                    <DropdownItem key="exec" onClick={() => { setMenuOpen(false); onExec(); }}>
                      {t("actions.shell")}
                    </DropdownItem>
                    <DropdownItem key="run" onClick={() => { setMenuOpen(false); onRun(); }}>
                      {t("actions.run")}
                    </DropdownItem>
                    <Divider key="div1" component="li" />
                    <DropdownItem key="prune" isDanger onClick={() => { setMenuOpen(false); onPrune(); }}>
                      {t("actions.prune")}
                    </DropdownItem>
                    <DropdownItem key="kill" isDanger onClick={() => { setMenuOpen(false); onKill(); }}>
                      {t("actions.kill")}
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
        aria-label={t("stack_row.containers_aria", { name: stack.Name })}
        id={`expand-${stack.Name}`}
        isHidden={!expanded}
        hasNoPadding
      >
        <div className="sr-containers-panel">
          {loadingContainers ? (
            <Spinner size="md" />
          ) : containers.length === 0 ? (
            <span className="sr-no-containers">{t("stack_row.no_containers")}</span>
          ) : (
            <ContainerTable containers={containers} />
          )}
        </div>
      </DataListContent>
    </DataListItem>
  );
}
