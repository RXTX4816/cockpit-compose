import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Dropdown,
  DropdownList,
  DropdownItem,
  MenuToggle,
  Divider,
  Tooltip,
  Spinner,
} from "@patternfly/react-core";
import { type ComposeStack, parseStackStatus, parseServiceCount, formatBytes, getPortUrl } from "../../api";
import { effectiveStatus } from "../../lib/stackStatus";
import {
  EllipsisVIcon,
  ArrowsAltVIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  BellIcon,
  ListAltIcon,
  PlayIcon,
  BroomIcon,
  BanIcon,
  ArchiveIcon,
  RedoAltIcon,
} from "@patternfly/react-icons";
import { useStackActions } from "../../hooks/useStackActions";
import { useStackContainers } from "../../hooks/useStackContainers";
import { useContainerStats } from "../../hooks/useContainerStats";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ContainerTable } from "./ContainerTable";
import { splitConfigFiles } from "../../lib/configFiles";
import "./UnixRow.css";

interface UnixRowProps {
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

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  running: { text: "RUNNING", cls: "ur-status--running" },
  partial: { text: "PARTIAL", cls: "ur-status--partial" },
  stopped: { text: "STOPPED", cls: "ur-status--stopped" },
  paused:  { text: "PAUSED",  cls: "ur-status--paused"  },
  unknown: { text: "UNKNOWN", cls: "ur-status--stopped"  },
};

export function UnixRow({
  stack, expanded, onToggle, onLogs, onYaml, onInfo, onDown, onKill, onUp, onPull,
  onEvents, onTop, onExec, onRun, onPrune, onBackup, onScale, onActingChange,
}: UnixRowProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);

  const baseStatus = parseStackStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFiles = splitConfigFiles(stack.ConfigFiles);

  const { acting, doAction } = useStackActions(stack.Name, configFiles, onActingChange);
  const { containers, loading: loadingContainers, load: loadContainers, clear: clearContainers } =
    useStackContainers(stack.Name, configFiles, baseStatus);
  const { ports, stats } = useContainerStats(stack.Name, baseStatus);

  const status = effectiveStatus(baseStatus, containers);

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

  const sl = STATUS_LABEL[status] ?? STATUS_LABEL.unknown;
  const isUp = status === "running" || status === "partial" || status === "paused";
  const cpuStr = stats ? `${stats.cpu.toFixed(1)}%` : "—";
  const memStr = stats ? formatBytes(stats.mem) : "—";

  return (
    <>
      <div
        className={`ur-row${expanded ? " ur-row--expanded" : ""}${acting ? " ur-row--acting" : ""}`}
        data-status={status}
        data-stack-name={stack.Name}
      >
        <button className="ur-expand-btn" onClick={handleToggle} aria-expanded={expanded} aria-label={expanded ? "collapse" : "expand"}>
          {expanded ? "▾" : "▸"}
        </button>

        <span className="ur-col ur-col--name" title={stack.Name}>
          {stack.Name}
        </span>

        <span className={`ur-col ur-col--status ur-status ${sl.cls}`}>
          <span className="ur-status-dot" />
          {sl.text}
        </span>

        <span className="ur-col ur-col--svc">{count}</span>

        <span className={`ur-col ur-col--cpu ${stats && stats.cpu > 80 ? "ur-val--high" : stats && stats.cpu > 50 ? "ur-val--med" : "ur-val--ok"}`}>
          {cpuStr}
        </span>

        <span className="ur-col ur-col--mem">{memStr}</span>

        <span className="ur-col ur-col--ports">
          {ports.length === 0 ? "—" : ports.slice(0, 2).map(p => {
            const url = getPortUrl(p);
            return url ? (
              <span
                key={p.label}
                className="ur-port-link"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
                title={url}
              >
                :{p.hostPort ?? p.label.split(":").pop()}
              </span>
            ) : (
              <span key={p.label} className="ur-port">:{p.hostPort ?? p.label.split(":").pop()}</span>
            );
          })}
          {ports.length > 2 && <span className="ur-port"> +{ports.length - 2}</span>}
        </span>

        <div className="ur-col ur-col--actions">
          {isUp ? (
            <Tooltip content={t("actions.stop")}>
              <button className="ur-key ur-key--stop" onClick={() => setConfirmStopOpen(true)} disabled={acting}>[stop]</button>
            </Tooltip>
          ) : (
            <Tooltip content={t("actions.up_title")}>
              <button className="ur-key ur-key--up" onClick={onUp} disabled={acting}>[up]</button>
            </Tooltip>
          )}
          <Tooltip content={t("actions.down_title")}>
            <button className="ur-key ur-key--down" onClick={onDown} disabled={acting}>[down]</button>
          </Tooltip>
          <Tooltip content={t("actions.logs_title")}>
            <button className="ur-key" onClick={onLogs} disabled={acting}>[log]</button>
          </Tooltip>
          <Tooltip content={t("actions.shell")}>
            <button className="ur-key" onClick={onExec} disabled={acting}>[sh]</button>
          </Tooltip>
          <Tooltip content={t("actions.edit_title")}>
            <button className="ur-key" onClick={onYaml} disabled={acting}>[ed]</button>
          </Tooltip>
          <Tooltip content={t("actions.pull_title")}>
            <button className="ur-key" onClick={onPull} disabled={acting}>[pull]</button>
          </Tooltip>
          <Tooltip content={t("actions.info_title")}>
            <button className="ur-key" onClick={onInfo} disabled={acting}>[?]</button>
          </Tooltip>

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
                className="ur-menu-toggle"
              >
                <EllipsisVIcon />
              </MenuToggle>
            )}
            popperProps={{ position: "right" }}
          >
            <DropdownList>
              <DropdownItem key="restart" icon={<RedoAltIcon />} isDisabled={status === "stopped" || status === "unknown"} onClick={() => { setMenuOpen(false); setConfirmRestartOpen(true); }}>{t("actions.restart")}</DropdownItem>
              <DropdownItem key="pause" icon={status === "paused" ? <PlayCircleIcon /> : <PauseCircleIcon />} isDisabled={status === "stopped" || status === "unknown"} onClick={() => { setMenuOpen(false); void doAction(status === "paused" ? "unpause" : "pause", afterAction); }}>{status === "paused" ? t("actions.unpause") : t("actions.pause")}</DropdownItem>
              <DropdownItem key="scale" icon={<ArrowsAltVIcon />} onClick={() => { setMenuOpen(false); onScale(); }}>{t("actions.scale")}</DropdownItem>
              <DropdownItem key="events" icon={<BellIcon />} onClick={() => { setMenuOpen(false); onEvents(); }}>{t("actions.events")}</DropdownItem>
              <DropdownItem key="top" icon={<ListAltIcon />} onClick={() => { setMenuOpen(false); onTop(); }}>{t("actions.top")}</DropdownItem>
              <DropdownItem key="run" icon={<PlayIcon />} onClick={() => { setMenuOpen(false); onRun(); }}>{t("actions.run")}</DropdownItem>
              <DropdownItem key="backup" icon={<ArchiveIcon />} onClick={() => { setMenuOpen(false); onBackup(); }}>{t("actions.backup")}</DropdownItem>
              <Divider component="li" />
              <DropdownItem key="prune" icon={<BroomIcon />} isDanger onClick={() => { setMenuOpen(false); onPrune(); }}>{t("actions.prune")}</DropdownItem>
              <DropdownItem key="kill" icon={<BanIcon />} isDanger onClick={() => { setMenuOpen(false); onKill(); }}>{t("actions.kill")}</DropdownItem>
            </DropdownList>
          </Dropdown>
        </div>
      </div>

      {expanded && (
        <div className="ur-expanded">
          <div className="ur-expanded-inner">
            <span className="ur-expanded-prefix">└── containers</span>
            {loadingContainers ? (
              <div className="ur-expanded-loading"><Spinner size="sm" /> loading...</div>
            ) : containers.length === 0 ? (
              <span className="ur-expanded-empty">{t("stack_row.no_containers")}</span>
            ) : (
              <div className="ur-expanded-table">
                <ContainerTable containers={containers} />
              </div>
            )}
          </div>
        </div>
      )}

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
    </>
  );
}
