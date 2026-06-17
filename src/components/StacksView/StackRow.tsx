import { useState, useCallback, useEffect, type MouseEvent } from "react";
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
  ArrowAltCircleDownIcon,
  DownloadIcon,
  TerminalIcon,
  FileAltIcon,
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
import { StopModal } from "../StopModal";
import { RestartModal } from "../RestartModal";
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
  onBackup: () => void;
  onScale: () => void;
  onActingChange: (delta: 1 | -1) => void;
}

export function StackRow({ stack, expanded, onToggle, onLogs, onYaml, onInfo, onDown, onKill, onUp, onPull, onEvents, onTop, onExec, onRun, onPrune, onBackup, onScale, onActingChange }: StackRowProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);

  const baseStatus = parseStackStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFiles = splitConfigFiles(stack.ConfigFiles);

  const { acting, actionError, doAction } = useStackActions(stack.Name, configFiles, onActingChange);
  const { containers, loading: loadingContainers, load: loadContainers, clear: clearContainers } = useStackContainers(stack.Name, configFiles, baseStatus);

  const status = effectiveStatus(baseStatus, containers);

  useEffect(() => { void loadContainers(); }, [loadContainers]);
  useAutoRefresh(loadContainers, acting ? 500 : 3000, false);

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

  const handleRowClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, a, [role=button], .pf-v6-c-dropdown__toggle, .pf-v6-c-dropdown__menu")) return;
    handleToggle();
  };

  return (
    <>
    <DataListItem isExpanded={expanded} aria-labelledby={`stack-${stack.Name}`} data-status={status} data-stack-name={stack.Name}>
      <DataListItemRow onClick={handleRowClick} style={{ cursor: "pointer" }}>
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
                    onClick={() => setConfirmStopOpen(true)}
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
                      <ArrowAltCircleDownIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.restart")}>
                    <Button
                      variant="plain"
                      size="sm"
                      onClick={() => setConfirmRestartOpen(true)}
                      isDisabled={acting || status === "stopped" || status === "unknown"}
                      aria-label={t("actions.restart")}
                    >
                      <RedoAltIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.pull_title")}>
                    <Button variant="plain" size="sm" onClick={onPull} aria-label={t("actions.pull_title")}>
                      <DownloadIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.shell")}>
                    <Button variant="plain" size="sm" onClick={onExec} aria-label={t("actions.shell")}>
                      <TerminalIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.logs_title")}>
                    <Button variant="plain" size="sm" onClick={onLogs} aria-label={t("actions.logs_title")}>
                      <FileAltIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.edit_title")}>
                    <Button variant="plain" size="sm" onClick={onYaml} isDisabled={acting} aria-label={t("actions.edit_title")}>
                      <PencilAltIcon />
                    </Button>
                  </Tooltip>

                  <Tooltip content={t("actions.backup")}>
                    <Button variant="plain" size="sm" onClick={onBackup} aria-label={t("actions.backup")}>
                      <ArchiveIcon />
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
                    <DropdownItem key="run" icon={<PlayIcon />} onClick={() => { setMenuOpen(false); onRun(); }}>
                      {t("actions.run")}
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

    {confirmStopOpen && (
      <StopModal
        stackName={stack.Name}
        onConfirm={() => { setConfirmStopOpen(false); void doAction("stop", afterAction); }}
        onClose={() => setConfirmStopOpen(false)}
      />
    )}

    {confirmRestartOpen && (
      <RestartModal
        stackName={stack.Name}
        onConfirm={() => { setConfirmRestartOpen(false); void doAction("restart", afterAction); }}
        onClose={() => setConfirmRestartOpen(false)}
      />
    )}
    </>
  );
}
