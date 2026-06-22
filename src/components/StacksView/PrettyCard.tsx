import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dropdown,
  DropdownList,
  DropdownItem,
  MenuToggle,
  Divider,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "@patternfly/react-core";
import { Tooltip } from "@rxtx4816/cockpit-plugin-base-react/components";
import { type ComposeStack, parseStackStatus, parseServiceCount, formatBytes, getPortUrl, parseShortUptime } from "../../api";
import { effectiveStatus, stackHealthSummary } from "../../lib/stackStatus";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EllipsisVIcon,
  ArrowsAltVIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  BellIcon,
  ListAltIcon,
  PlayIcon,
  BroomIcon,
  BanIcon,
  DownloadIcon,
  TerminalIcon,
  FileAltIcon,
  PencilAltIcon,
  InfoCircleIcon,
  ArchiveIcon,
  RedoAltIcon,
  ArrowAltCircleDownIcon,
  AngleUpIcon,
} from "@patternfly/react-icons";
import { useStackActions } from "../../hooks/useStackActions";
import { useServiceActions } from "../../hooks/useServiceActions";
import { useStackContainers } from "../../hooks/useStackContainers";
import { useContainerStats } from "../../hooks/useContainerStats";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { splitConfigFiles } from "../../lib/configFiles";
import { LogsModal } from "../LogsModal";
import "./PrettyCard.css";

interface PrettyCardProps {
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

const STATUS_BORDER: Record<string, string> = {
  running: "var(--pf-t--color--green--40, #6ec664)",
  partial: "var(--pf-t--color--gold--40, #f0ab00)",
  stopped: "var(--pf-t--color--gray--30, #c7c7c7)",
  paused:  "var(--pf-t--color--blue--40, #2b9af3)",
  unknown: "var(--pf-t--color--gray--30, #c7c7c7)",
};

const STATUS_GLOW: Record<string, string> = {
  running: "rgba(110, 198, 100, 0.22)",
  partial: "rgba(240, 171, 0, 0.22)",
  stopped: "rgba(0, 0, 0, 0.06)",
  paused:  "rgba(43, 154, 243, 0.20)",
  unknown: "rgba(0, 0, 0, 0.06)",
};

export function PrettyCard({
  stack, expanded, onToggle, onLogs, onYaml, onInfo, onDown, onKill, onUp, onPull,
  onEvents, onTop, onExec, onRun, onPrune, onBackup, onScale, onActingChange,
}: PrettyCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);
  const [logsService, setLogsService] = useState<string | null>(null);

  const baseStatus = parseStackStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFiles = splitConfigFiles(stack.ConfigFiles);

  const { acting, doAction } = useStackActions(stack.Name, configFiles, onActingChange);
  const { actingService, doServiceAction } = useServiceActions(stack, onActingChange);
  const { containers, loading: loadingContainers, load: loadContainers, clear: clearContainers } =
    useStackContainers(stack.Name, configFiles, baseStatus);
  const { ports, stats } = useContainerStats(stack.Name, baseStatus);

  const status = effectiveStatus(baseStatus, containers);
  const healthSummary = stackHealthSummary(containers);

  const afterAction = useCallback(async () => {
    clearContainers();
    await loadContainers();
  }, [clearContainers, loadContainers]);

  const handleToggle = () => {
    onToggle();
    if (!expanded) void loadContainers();
  };

  useEffect(() => { void loadContainers(); }, [loadContainers]);
  useAutoRefresh(loadContainers, acting ? 500 : 3000, false);

  const isRunning = status === "running" || status === "partial";
  const cpuPct = stats?.cpu ?? 0;
  const cpuColor = cpuPct > 80 ? "#e17055" : cpuPct > 50 ? "#fdcb6e" : "#00b894";

  return (
    <>
      <div
        className={`pc-card${acting ? " pc-card--acting" : ""}${expanded ? " pc-card--expanded" : ""}`}
        style={{
          "--status-glow": STATUS_GLOW[status],
          "--status-border": STATUS_BORDER[status] ?? STATUS_BORDER.unknown,
        } as CSSProperties}
        data-status={status}
        data-stack-name={stack.Name}
      >
        {status === "running" && <span className="pc-pulse" />}

        {/* Header */}
        <div className="pc-header">
          <div className="pc-header-left">
            <span className="pc-name">{stack.Name}</span>
            <span className="pc-subtitle">
              {t("stacks.service_count", { count })}
              {healthSummary === "unhealthy" && (
                <ExclamationTriangleIcon className="pc-health-icon pc-health-icon--warn" title={t("health.failing")} />
              )}
              {healthSummary === "healthy" && (
                <CheckCircleIcon className="pc-health-icon pc-health-icon--ok" title={t("health.passing")} />
              )}
            </span>
          </div>

          <Dropdown
            isOpen={menuOpen}
            onOpenChange={(o) => setMenuOpen(o)}
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
              <DropdownItem key="scale" icon={<ArrowsAltVIcon />} onClick={() => { setMenuOpen(false); onScale(); }}>{t("actions.scale")}</DropdownItem>
              <DropdownItem key="restart" icon={<RedoAltIcon />} isDisabled={status === "stopped" || status === "unknown"} onClick={() => { setMenuOpen(false); setConfirmRestartOpen(true); }}>{t("actions.restart")}</DropdownItem>
              <DropdownItem key="pause" icon={status === "paused" ? <PlayCircleIcon /> : <PauseCircleIcon />} isDisabled={status === "stopped" || status === "unknown"} onClick={() => { setMenuOpen(false); void doAction(status === "paused" ? "unpause" : "pause", afterAction); }}>{status === "paused" ? t("actions.unpause") : t("actions.pause")}</DropdownItem>
              <Divider component="li" />
              <DropdownItem key="events" icon={<BellIcon />} onClick={() => { setMenuOpen(false); onEvents(); }}>{t("actions.events")}</DropdownItem>
              <DropdownItem key="top" icon={<ListAltIcon />} onClick={() => { setMenuOpen(false); onTop(); }}>{t("actions.top")}</DropdownItem>
              <DropdownItem key="run" icon={<PlayIcon />} onClick={() => { setMenuOpen(false); onRun(); }}>{t("actions.run")}</DropdownItem>
              <Divider component="li" />
              <DropdownItem key="prune" icon={<BroomIcon />} isDanger onClick={() => { setMenuOpen(false); onPrune(); }}>{t("actions.prune")}</DropdownItem>
              <DropdownItem key="kill" icon={<BanIcon />} isDanger onClick={() => { setMenuOpen(false); onKill(); }}>{t("actions.kill")}</DropdownItem>
            </DropdownList>
          </Dropdown>
        </div>

        {/* Stats row */}
        {(stats || ports.length > 0) && (
          <div className="pc-stats">
            {stats && (
              <div className="pc-cpu-wrap">
                <span className="pc-stat-label">CPU</span>
                <div className="pc-cpu-track">
                  <div
                    className="pc-cpu-fill"
                    key={cpuPct}
                    style={{ "--cpu-pct": `${cpuPct.toFixed(1)}%`, "--cpu-color": cpuColor } as CSSProperties}
                  />
                </div>
                <span className="pc-stat-val" style={{ color: cpuColor }}>{cpuPct.toFixed(1)}%</span>
              </div>
            )}
            {stats && (
              <span className="pc-mem">
                <span className="pc-stat-label">RAM</span>
                <span className="pc-stat-val">{formatBytes(stats.mem)}</span>
              </span>
            )}
            {ports.length > 0 && (
              <div className="pc-ports">
                {ports.slice(0, 4).map(p => {
                  const url = getPortUrl(p);
                  return (
                    <span
                      key={p.label}
                      className={`pc-port-pill${url ? " pc-port-pill--link" : ""}`}
                      onClick={url ? () => window.open(url, "_blank", "noopener,noreferrer") : undefined}
                      title={url ?? undefined}
                    >
                      {p.label}
                    </span>
                  );
                })}
                {ports.length > 4 && <span className="pc-port-more">+{ports.length - 4}</span>}
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        <div className="pc-actions">
          <div className="pc-actions-left">
            <Button variant="primary" size="sm" onClick={onUp} isDisabled={acting} icon={<AngleUpIcon />}>
              {t("actions.up")}
            </Button>

            {isRunning ? (
              <Button variant="primary" size="sm" onClick={() => setConfirmStopOpen(true)} isDisabled={acting}>
                {t("actions.stop")}
              </Button>
            ) : status === "stopped" ? (
              <Button variant="primary" size="sm" onClick={() => void doAction("start", afterAction)} isDisabled={acting}>
                {t("actions.start")}
              </Button>
            ) : null}
          </div>

          <div className="pc-actions-right">
            <Tooltip content={t("actions.pull_title")}>
              <button className="pc-icon-btn" onClick={onPull} disabled={acting} aria-label={t("actions.pull_title")}>
                <DownloadIcon />
              </button>
            </Tooltip>
            <Tooltip content={t("actions.shell")}>
              <button className="pc-icon-btn" onClick={onExec} disabled={acting} aria-label={t("actions.shell")}>
                <TerminalIcon />
              </button>
            </Tooltip>
            <Tooltip content={t("actions.logs_title")}>
              <button className="pc-icon-btn" onClick={onLogs} disabled={acting} aria-label={t("actions.logs_title")}>
                <FileAltIcon />
              </button>
            </Tooltip>
            <Tooltip content={t("actions.edit_title")}>
              <button className="pc-icon-btn" onClick={onYaml} disabled={acting} aria-label={t("actions.edit_title")}>
                <PencilAltIcon />
              </button>
            </Tooltip>
            <Tooltip content={t("actions.backup")}>
              <button className="pc-icon-btn" onClick={onBackup} disabled={acting} aria-label={t("actions.backup")}>
                <ArchiveIcon />
              </button>
            </Tooltip>
            <Tooltip content={t("actions.info_title")}>
              <button className="pc-icon-btn" onClick={onInfo} disabled={acting} aria-label={t("actions.info_title")}>
                <InfoCircleIcon />
              </button>
            </Tooltip>
            <Tooltip content={t("actions.down_title")}>
              <button className="pc-icon-btn pc-icon-btn--danger" onClick={onDown} disabled={acting} aria-label={t("actions.down_title")}>
                <ArrowAltCircleDownIcon />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Expand toggle */}
        <button
          className="pc-expand-toggle"
          onClick={handleToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "collapse" : "expand"}
        >
          <span className={`pc-expand-chevron${expanded ? " pc-expand-chevron--open" : ""}`}>›</span>
          {t("stacks.service_count", { count })}
        </button>

        {/* Expanded — compact container list */}
        {expanded && (
          <div className="pc-expanded">
            {loadingContainers ? (
              <div className="pc-expanded-loading"><Spinner size="md" /></div>
            ) : containers.length === 0 ? (
              <span className="pc-expanded-empty">{t("stack_row.no_containers")}</span>
            ) : (
              <div className="pc-container-list">
                {[...new Set(containers.map(c => c.Service || c.Name))].map(svc => {
                  const group = containers.filter(c => (c.Service || c.Name) === svc);
                  const rep = group[0];
                  const isRunning = rep?.State?.toLowerCase() === "running";
                  const uptime = rep?.Status ?? "—";
                  const isSvcActing = actingService === svc;
                  return (
                    <div key={svc} className="pc-container-row">
                      <span className={`pc-container-dot${isRunning ? " pc-container-dot--up" : ""}`} />
                      <span className="pc-container-name">{svc}{group.length > 1 ? ` ×${group.length}` : ""}</span>
                      <span className="pc-container-actions">
                        {isSvcActing ? (
                          <Spinner size="sm" />
                        ) : (
                          <>
                            {isRunning ? (
                              <Tooltip content={t("service_actions.stop")}>
                                <button
                                  className="pc-svc-btn"
                                  aria-label={t("service_actions.stop")}
                                  onClick={() => void doServiceAction("stop", svc, loadContainers)}
                                  disabled={acting}
                                >
                                  <BanIcon />
                                </button>
                              </Tooltip>
                            ) : (
                              <Tooltip content={t("service_actions.start")}>
                                <button
                                  className="pc-svc-btn"
                                  aria-label={t("service_actions.start")}
                                  onClick={() => void doServiceAction("start", svc, loadContainers)}
                                  disabled={acting}
                                >
                                  <PlayIcon />
                                </button>
                              </Tooltip>
                            )}
                            <Tooltip content={t("service_actions.restart")}>
                              <button
                                className="pc-svc-btn"
                                aria-label={t("service_actions.restart")}
                                onClick={() => void doServiceAction("restart", svc, loadContainers)}
                                disabled={acting}
                              >
                                <RedoAltIcon />
                              </button>
                            </Tooltip>
                            <Tooltip content={t("service_actions.logs")}>
                              <button
                                className="pc-svc-btn"
                                aria-label={t("service_actions.logs")}
                                onClick={() => setLogsService(svc)}
                                disabled={acting}
                              >
                                <ListAltIcon />
                              </button>
                            </Tooltip>
                          </>
                        )}
                      </span>
                      <span className="pc-container-uptime" title={uptime}>{parseShortUptime(uptime)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmStopOpen && (
        <Modal isOpen variant="small" onClose={() => setConfirmStopOpen(false)} aria-label={t("stop_modal.aria_label")}>
          <ModalHeader title={t("stop_modal.title", { name: stack.Name })} />
          <ModalBody><p>{t("stop_modal.body")}</p></ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={() => { setConfirmStopOpen(false); void doAction("stop", afterAction); }}>{t("stop_modal.confirm_button")}</Button>
            <Button variant="link" onClick={() => setConfirmStopOpen(false)}>{t("common.cancel")}</Button>
          </ModalFooter>
        </Modal>
      )}

      {confirmRestartOpen && (
        <Modal isOpen variant="small" onClose={() => setConfirmRestartOpen(false)} aria-label={t("restart_modal.aria_label")}>
          <ModalHeader title={t("restart_modal.title", { name: stack.Name })} />
          <ModalBody><p>{t("restart_modal.body")}</p></ModalBody>
          <ModalFooter>
            <Button variant="warning" onClick={() => { setConfirmRestartOpen(false); void doAction("restart", afterAction); }}>{t("restart_modal.confirm_button")}</Button>
            <Button variant="link" onClick={() => setConfirmRestartOpen(false)}>{t("common.cancel")}</Button>
          </ModalFooter>
        </Modal>
      )}

      {logsService && (
        <LogsModal stack={stack} initialService={logsService} onClose={() => setLogsService(null)} />
      )}
    </>
  );
}
