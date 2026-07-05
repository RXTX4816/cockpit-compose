import { useState, useCallback, useEffect, useRef, type MouseEvent } from "react";
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
import { type ComposeStack, parseStackStatus, parseServiceCount } from "../../api";
import { effectiveStatus } from "../../lib/stackStatus";
import {
  AngleUpIcon,
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
import { useServiceActions } from "../../hooks/useServiceActions";
import { useStackContainers } from "../../hooks/useStackContainers";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ContainerTable } from "./ContainerTable";
import { LogsModal } from "../LogsModal";
import { splitConfigFiles } from "../../lib/configFiles";
import "./MinimalCard.css";

const BUBBLE_OPEN_DELAY_MS = 400;
const BUBBLE_CLOSE_DELAY_MS = 25;

interface MinimalCardProps {
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
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

const STATUS_VARS: Record<string, { bg: string; border: string }> = {
  running: { bg: "rgba(63, 134, 53, 0.10)", border: "var(--pf-t--color--green--40, #6ec664)" },
  partial: { bg: "rgba(240, 171, 0, 0.12)",  border: "var(--pf-t--color--gold--40, #f0ab00)" },
  stopped: { bg: "rgba(0, 0, 0, 0.04)",       border: "var(--pf-t--color--gray--30, #c7c7c7)" },
  paused:  { bg: "rgba(0, 102, 204, 0.10)",   border: "var(--pf-t--color--blue--40, #2b9af3)" },
  unknown: { bg: "rgba(0, 0, 0, 0.04)",       border: "var(--pf-t--color--gray--30, #c7c7c7)" },
};

export function MinimalCard({
  stack, onLogs, onYaml, onInfo, onDown, onKill, onUp, onPull,
  onEvents, onTop, onExec, onRun, onPrune, onBackup, onScale, onActingChange,
  isSelected = false, onToggleSelect,
}: MinimalCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const [bubblePos, setBubblePos] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const baseStatus = parseStackStatus(stack.Status);
  const count = parseServiceCount(stack.Status);
  const configFiles = splitConfigFiles(stack.ConfigFiles);

  const { acting, doAction } = useStackActions(stack.Name, configFiles, onActingChange);
  const { actingService, doServiceAction } = useServiceActions(stack, onActingChange);
  const [logsService, setLogsService] = useState<string | null>(null);
  const { containers, loading: loadingContainers, load: loadContainers, clear: clearContainers } =
    useStackContainers(stack.Name, configFiles, baseStatus);
  const status = effectiveStatus(baseStatus, containers);

  const afterAction = useCallback(async () => {
    clearContainers();
    await loadContainers();
  }, [clearContainers, loadContainers]);

  useEffect(() => { void loadContainers(); }, [loadContainers]);
  useAutoRefresh(loadContainers, acting ? 500 : 3000, false);

  const clearOpenTimer = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };
  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const scheduleBubbleClose = () => {
    clearOpenTimer();
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setBubblePos(null), BUBBLE_CLOSE_DELAY_MS);
  };
  const showBubble = () => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (rect) {
      const W = 560, H = 320;
      const vw = window.innerWidth;
      let left = rect.left + rect.width / 2 - W / 2;
      const top = rect.top - H - 8 < 8 ? rect.bottom + 8 : rect.top - H - 8;
      if (left < 8) left = 8;
      if (left + W > vw - 8) left = vw - W - 8;
      setBubblePos({ left, top });
    }
    void loadContainers();
  };
  const scheduleBubbleOpen = () => {
    clearCloseTimer();
    clearOpenTimer();
    openTimerRef.current = window.setTimeout(showBubble, BUBBLE_OPEN_DELAY_MS);
  };
  useEffect(() => () => { clearOpenTimer(); clearCloseTimer(); }, []);

  const handleCardClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onToggleSelect) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, .pf-v6-c-dropdown")) return;
    onToggleSelect();
  };

  const isUp = status === "running" || status === "partial" || status === "paused";
  const sv = STATUS_VARS[status] ?? STATUS_VARS.unknown;

  return (
    <>
      <div
        ref={cardRef}
        className={`mc-card${acting ? " mc-card--acting" : ""}${isSelected ? " mc-card--selected" : ""}${bubblePos ? " mc-card--open" : ""}`}
        style={{ backgroundColor: sv.bg, borderColor: sv.border }}
        data-status={status}
        data-stack-name={stack.Name}
        onClick={handleCardClick}
        onMouseEnter={scheduleBubbleOpen}
        onMouseLeave={scheduleBubbleClose}
        role="button"
        tabIndex={0}
        aria-pressed={onToggleSelect ? isSelected : undefined}
        aria-label={`${stack.Name} — ${status}`}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleCardClick(e as unknown as MouseEvent<HTMLDivElement>); }}
      >
        <div className="mc-kebab" onClick={(e) => e.stopPropagation()}>
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
                className="mc-menu-toggle"
              >
                <EllipsisVIcon />
              </MenuToggle>
            )}
            popperProps={{ position: "right" }}
          >
            <DropdownList>
              {(status === "running" || status === "partial") && (
                <DropdownItem key="stop" onClick={() => { setMenuOpen(false); setConfirmStopOpen(true); }}>{t("actions.stop")}</DropdownItem>
              )}
              {status === "stopped" && (
                <DropdownItem key="start" onClick={() => { setMenuOpen(false); void doAction("start", afterAction); }}>{t("actions.start")}</DropdownItem>
              )}
              {(status === "running" || status === "partial" || status === "stopped") && <Divider component="li" />}
              <DropdownItem key="pull" icon={<DownloadIcon />} onClick={() => { setMenuOpen(false); onPull(); }}>{t("actions.pull_title")}</DropdownItem>
              <DropdownItem key="shell" icon={<TerminalIcon />} onClick={() => { setMenuOpen(false); onExec(); }}>{t("actions.shell")}</DropdownItem>
              <DropdownItem key="logs" icon={<FileAltIcon />} onClick={() => { setMenuOpen(false); onLogs(); }}>{t("actions.logs_title")}</DropdownItem>
              <DropdownItem key="edit" icon={<PencilAltIcon />} onClick={() => { setMenuOpen(false); onYaml(); }}>{t("actions.edit_title")}</DropdownItem>
              <DropdownItem key="backup" icon={<ArchiveIcon />} onClick={() => { setMenuOpen(false); onBackup(); }}>{t("actions.backup")}</DropdownItem>
              <DropdownItem key="info" icon={<InfoCircleIcon />} onClick={() => { setMenuOpen(false); onInfo(); }}>{t("actions.info_title")}</DropdownItem>
              <Divider component="li" />
              <DropdownItem key="restart" icon={<RedoAltIcon />} isDisabled={status === "stopped" || status === "unknown"} onClick={() => { setMenuOpen(false); void doAction("restart", afterAction); }}>{t("actions.restart")}</DropdownItem>
              <DropdownItem key="pause" icon={status === "paused" ? <PlayCircleIcon /> : <PauseCircleIcon />} isDisabled={status === "stopped" || status === "unknown"} onClick={() => { setMenuOpen(false); void doAction(status === "paused" ? "unpause" : "pause", afterAction); }}>{status === "paused" ? t("actions.unpause") : t("actions.pause")}</DropdownItem>
              <DropdownItem key="scale" icon={<ArrowsAltVIcon />} onClick={() => { setMenuOpen(false); onScale(); }}>{t("actions.scale")}</DropdownItem>
              <DropdownItem key="events" icon={<BellIcon />} onClick={() => { setMenuOpen(false); onEvents(); }}>{t("actions.events")}</DropdownItem>
              <DropdownItem key="top" icon={<ListAltIcon />} onClick={() => { setMenuOpen(false); onTop(); }}>{t("actions.top")}</DropdownItem>
              <DropdownItem key="run" icon={<PlayIcon />} onClick={() => { setMenuOpen(false); onRun(); }}>{t("actions.run")}</DropdownItem>
              <Divider component="li" />
              <DropdownItem key="prune" icon={<BroomIcon />} isDanger onClick={() => { setMenuOpen(false); onPrune(); }}>{t("actions.prune")}</DropdownItem>
              <DropdownItem key="kill" icon={<BanIcon />} isDanger onClick={() => { setMenuOpen(false); onKill(); }}>{t("actions.kill")}</DropdownItem>
            </DropdownList>
          </Dropdown>
        </div>

        <div className="mc-body">
          <div className="mc-name">{stack.Name}</div>
          <div className="mc-services">{t("stacks.service_count", { count })}</div>
          {containers.length > 0 && (
            <div className="mc-dots" aria-hidden="true">
              {containers.map(c => {
                const h = c.Health?.toLowerCase();
                const dotClass = h === "healthy" ? "mc-dot--healthy"
                  : h === "unhealthy" ? "mc-dot--unhealthy"
                  : h === "starting" ? "mc-dot--starting"
                  : c.State?.toLowerCase() === "running" ? "mc-dot--running"
                  : "mc-dot--stopped";
                return (
                  <Tooltip key={c.Name} content={`${c.Service || c.Name}: ${h ?? c.State ?? "unknown"}`}>
                    <span className={`mc-dot ${dotClass}`} />
                  </Tooltip>
                );
              })}
            </div>
          )}
        </div>

        <div className="mc-footer" onClick={(e) => e.stopPropagation()}>
          {isUp ? (
            <Tooltip content={t("actions.down_title")}>
              <Button
                variant="plain"
                size="sm"
                onClick={() => onDown()}
                isDisabled={acting}
                className="mc-toggle-btn mc-toggle-btn--down"
                aria-label={t("actions.down_title")}
              >
                <ArrowAltCircleDownIcon />
              </Button>
            </Tooltip>
          ) : (
            <Tooltip content={t("actions.up_title")}>
              <Button
                variant="plain"
                size="sm"
                onClick={() => onUp()}
                isDisabled={acting}
                className="mc-toggle-btn mc-toggle-btn--up"
                aria-label={t("actions.up_title")}
              >
                <AngleUpIcon />
              </Button>
            </Tooltip>
          )}
        </div>
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

      {bubblePos && (
        <div
          className="mc-bubble"
          style={bubblePos}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleBubbleClose}
          onClick={(e) => e.stopPropagation()}
        >
          {loadingContainers ? (
            <div className="mc-bubble-center"><Spinner size="md" /></div>
          ) : containers.length === 0 ? (
            <div className="mc-bubble-center">{t("stack_row.no_containers")}</div>
          ) : (
            <>
              <div className="mc-bubble-title">{stack.Name}</div>
              <ContainerTable
                containers={containers}
                actions={{
                  actingService,
                  onStart: s => { void doServiceAction("start", s, loadContainers); },
                  onStop: s => { void doServiceAction("stop", s, loadContainers); },
                  onRestart: s => { void doServiceAction("restart", s, loadContainers); },
                  onLogs: s => setLogsService(s),
                }}
              />
            </>
          )}
        </div>
      )}
      {logsService && (
        <LogsModal stack={stack} initialService={logsService} onClose={() => setLogsService(null)} />
      )}
    </>
  );
}
