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
  Tooltip,
} from "@patternfly/react-core";
import {
  type ComposeStack,
  type ComposeContainer,
  parseStackStatus,
  parseServiceCount,
} from "../../api";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  TimesCircleIcon,
  DownloadIcon,
  TerminalIcon,
  PencilAltIcon,
  InfoCircleIcon,
  EllipsisVIcon,
  ArrowsAltVIcon,
  RedoAltIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  BellIcon,
  ListAltIcon,
  PlayIcon,
  ArchiveIcon,
  BroomIcon,
  BanIcon,
} from "@patternfly/react-icons";
import { useStackActions } from "../../hooks/useStackActions";
import { useStackContainers } from "../../hooks/useStackContainers";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { StatusLabel } from "./StatusLabel";
import { StatsCell } from "./StatsCell";
import { ContainerTable } from "./ContainerTable";
import "./StackRow.css";
import { splitConfigFiles } from "../../lib/configFiles";

function effectiveStatus(base: ReturnType<typeof parseStackStatus>, containers: ComposeContainer[]): ReturnType<typeof parseStackStatus> {
  if (base !== "partial" || containers.length === 0) return base;
  const exited = containers.filter(c => c.State === "exited");
  if (exited.length === 0) return base;
  return exited.every(c => /exited \(0\)/i.test(c.Status)) ? "running" : base;
}

function stackHealthSummary(containers: ComposeContainer[]): "healthy" | "unhealthy" | null {
  const withHealth = containers.filter(c => c.Health);
  if (withHealth.length === 0) return null;
  if (withHealth.some(c => c.Health!.toLowerCase() !== "healthy")) return "unhealthy";
  return "healthy";
}

interface StackRowProps {
  stack: ComposeStack;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onSelect: () => void;
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
  onBackup: () => void;
  onScale: () => void;
  onActingChange: (delta: 1 | -1) => void;
}

export function StackRow({ stack, expanded, selected, onToggle, onSelect, onLogs, onYaml, onInfo, onDown, onKill, onUp, onPull, onEvents, onTop, onExec, onRun, onPrune, onBackup, onScale, onActingChange }: StackRowProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const baseStatus = parseStackStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFiles = splitConfigFiles(stack.ConfigFiles);

  const { acting, actionError, doAction } = useStackActions(stack.Name, configFiles, onActingChange);
  const { containers, loading: loadingContainers, load: loadContainers, clear: clearContainers } = useStackContainers(stack.Name, configFiles, baseStatus);

  const status = effectiveStatus(baseStatus, containers);

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

  const healthSummary = stackHealthSummary(containers);

  return (
    <DataListItem isExpanded={expanded} aria-labelledby={`stack-${stack.Name}`} data-status={status} data-stack-name={stack.Name} className={selected ? "sr-row--selected" : ""}>
      <DataListItemRow>
        <div className="sr-select-wrap">
          <input
            type="checkbox"
            className="sr-select-checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={t("stacks.select_stack", { name: stack.Name })}
            onClick={e => e.stopPropagation()}
          />
        </div>
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
                {healthSummary === "unhealthy" && (
                  <ExclamationTriangleIcon
                    color="var(--pf-t--global--icon--color--status--warning--default)"
                    title={t("health.failing")}
                  />
                )}
                {healthSummary === "healthy" && (
                  <CheckCircleIcon
                    color="var(--pf-t--global--icon--color--status--success--default)"
                    title={t("health.passing")}
                  />
                )}
                <span id={`stack-${stack.Name}`} className="sr-stack-name">
                  {stack.Name}
                </span>
                {containers.length > 0 && (
                  <span className="sr-health-dots" aria-hidden="true">
                    {containers.map(c => {
                      const h = c.Health?.toLowerCase();
                      const dotClass = h === "healthy" ? "sr-dot--healthy"
                        : h === "unhealthy" ? "sr-dot--unhealthy"
                        : h === "starting" ? "sr-dot--starting"
                        : c.State?.toLowerCase() === "running" ? "sr-dot--running"
                        : "sr-dot--stopped";
                      return (
                        <Tooltip key={c.Name} content={`${c.Service || c.Name}: ${h ?? c.State ?? "unknown"}`}>
                          <span className={`sr-dot ${dotClass}`} />
                        </Tooltip>
                      );
                    })}
                  </span>
                )}
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
                <Tooltip content={t("actions.up_title")}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onUp}
                    isDisabled={acting}
                  >
                    {t("actions.up")}
                  </Button>
                </Tooltip>

                {(status === "running" || status === "partial") ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void doAction("stop", afterAction)}
                    isLoading={acting}
                    isDisabled={acting}
                  >
                    {t("actions.stop")}
                  </Button>
                ) : status === "stopped" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void doAction("start", afterAction)}
                    isLoading={acting}
                    isDisabled={acting}
                  >
                    {t("actions.start")}
                  </Button>
                )}

                <span className="sr-icon-group">
                  <Tooltip content={t("actions.down_title")}>
                    <Button
                      variant="plain"
                      size="sm"
                      onClick={onDown}
                      isDisabled={acting}
                      className="sr-down-btn"
                      aria-label={t("actions.down_title")}
                    >
                      <TimesCircleIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.pull_title")}>
                    <Button variant="plain" size="sm" onClick={onPull} aria-label={t("actions.pull_title")}>
                      <DownloadIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.logs_title")}>
                    <Button variant="plain" size="sm" onClick={onLogs} aria-label={t("actions.logs_title")}>
                      <TerminalIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.edit_title")}>
                    <Button variant="plain" size="sm" onClick={onYaml} isDisabled={acting} aria-label={t("actions.edit_title")}>
                      <PencilAltIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.info_title")}>
                    <Button variant="plain" size="sm" onClick={onInfo} aria-label={t("actions.info_title")}>
                      <InfoCircleIcon />
                    </Button>
                  </Tooltip>
                </span>

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
                      <EllipsisVIcon />
                    </MenuToggle>
                  )}
                  popperProps={{ position: "right" }}
                >
                  <DropdownList>
                    <DropdownItem
                      key="scale"
                      icon={<ArrowsAltVIcon />}
                      onClick={() => { setMenuOpen(false); onScale(); }}
                    >
                      {t("actions.scale")}
                    </DropdownItem>
                    <Divider key="div-scale" component="li" />
                    <DropdownItem
                      key="restart"
                      icon={<RedoAltIcon />}
                      isDisabled={status === "stopped" || status === "unknown"}
                      onClick={() => { setMenuOpen(false); void doAction("restart", afterAction); }}
                    >
                      {t("actions.restart")}
                    </DropdownItem>
                    <DropdownItem
                      key="pause"
                      icon={status === "paused" ? <PlayCircleIcon /> : <PauseCircleIcon />}
                      isDisabled={status === "stopped" || status === "unknown"}
                      onClick={() => {
                        setMenuOpen(false);
                        void doAction(status === "paused" ? "unpause" : "pause", afterAction);
                      }}
                    >
                      {status === "paused" ? t("actions.unpause") : t("actions.pause")}
                    </DropdownItem>
                    <DropdownItem key="events" icon={<BellIcon />} onClick={() => { setMenuOpen(false); onEvents(); }}>
                      {t("actions.events")}
                    </DropdownItem>
                    <DropdownItem key="top" icon={<ListAltIcon />} onClick={() => { setMenuOpen(false); onTop(); }}>
                      {t("actions.top")}
                    </DropdownItem>
                    <DropdownItem key="exec" icon={<TerminalIcon />} onClick={() => { setMenuOpen(false); onExec(); }}>
                      {t("actions.shell")}
                    </DropdownItem>
                    <DropdownItem key="run" icon={<PlayIcon />} onClick={() => { setMenuOpen(false); onRun(); }}>
                      {t("actions.run")}
                    </DropdownItem>
                    <DropdownItem key="backup" icon={<ArchiveIcon />} onClick={() => { setMenuOpen(false); onBackup(); }}>
                      {t("actions.backup")}
                    </DropdownItem>
                    <Divider key="div1" component="li" />
                    <DropdownItem key="prune" icon={<BroomIcon />} isDanger onClick={() => { setMenuOpen(false); onPrune(); }}>
                      {t("actions.prune")}
                    </DropdownItem>
                    <DropdownItem key="kill" icon={<BanIcon />} isDanger onClick={() => { setMenuOpen(false); onKill(); }}>
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
