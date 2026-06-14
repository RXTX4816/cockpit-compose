import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Spinner,
  Alert,
} from "@patternfly/react-core";
import { PlayCircleIcon, StopCircleIcon, TimesIcon } from "@patternfly/react-icons";
import { type ComposeStack } from "../api";
import { useEventStream } from "../hooks/useEventStream";
import "./EventsModal.css";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

function formatEventTime(t: string | number): string {
  try {
    const d = typeof t === "string" ? new Date(t) : new Date(t * 1000);
    return d.toLocaleTimeString();
  } catch {
    return String(t);
  }
}

export function EventsModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const { events, streaming, error, start, stop, clear } = useEventStream(stack.Name);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (tableBodyRef.current?.scrollIntoView) {
      tableBodyRef.current.scrollIntoView({ block: "end" });
    }
  }, [events.length]);

  function handleStart() {
    clear();
    start();
  }

  return (
    <Modal
      isOpen
      onClose={() => { stop(); onClose(); }}
      variant="large"
      width="90vw"
      aria-label={t("events_modal.aria_label", { name: stack.Name })}
    >
      <ModalHeader title={t("events_modal.title", { name: stack.Name })} />
      <ModalBody>
        <Toolbar className="em-toolbar">
          <ToolbarContent>
            <ToolbarItem>
              {streaming ? (
                <Button variant="secondary" size="sm" icon={<StopCircleIcon />} onClick={stop}>
                  {t("events_modal.stop_button")}
                </Button>
              ) : (
                <Button variant="primary" size="sm" icon={<PlayCircleIcon />} onClick={handleStart}>
                  {t("events_modal.stream_button")}
                </Button>
              )}
            </ToolbarItem>
            {streaming && (
              <ToolbarItem>
                <Spinner size="sm" />
              </ToolbarItem>
            )}
            {events.length > 0 && !streaming && (
              <ToolbarItem>
                <Button variant="plain" size="sm" icon={<TimesIcon />} onClick={clear} aria-label={t("events_modal.clear_button")} title={t("events_modal.clear_button")}>{t("events_modal.clear_button")}</Button>
              </ToolbarItem>
            )}
          </ToolbarContent>
        </Toolbar>

        {error && (
          <Alert variant="danger" isInline title={t("events_modal.error_title")} style={{ marginTop: "0.5rem" }}>
            {error}
          </Alert>
        )}

        <div className="em-table-wrapper">
          {events.length === 0 && !streaming ? (
            <div className="em-empty">
              {error ? null : t("events_modal.stream_prompt")}
            </div>
          ) : (
            <table className="em-table">
              <thead>
                <tr>
                  <th>{t("events_modal.col_time")}</th>
                  <th>{t("events_modal.col_type")}</th>
                  <th>{t("events_modal.col_action")}</th>
                  <th>{t("events_modal.col_service")}</th>
                  <th>{t("events_modal.col_details")}</th>
                </tr>
              </thead>
              <tbody ref={tableBodyRef}>
                {events.map((ev, i) => {
                  const service = ev.actor?.Attributes?.["com.docker.compose.service"]
                    ?? ev.actor?.Attributes?.name
                    ?? ev.actor?.ID?.slice(0, 12)
                    ?? "—";
                  const details = Object.entries(ev.actor?.Attributes ?? {})
                    .filter(([k]) => !k.startsWith("com.docker.compose.") && k !== "name")
                    .map(([k, v]) => `${k}=${v}`)
                    .join(", ");
                  return (
                    <tr key={i} className={`em-row em-row--${ev.type}`}>
                      <td className="em-cell-time">{formatEventTime(ev.time)}</td>
                      <td>{ev.type}</td>
                      <td><span className="em-action">{ev.action}</span></td>
                      <td>{service}</td>
                      <td className="em-cell-details">{details || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={() => { stop(); onClose(); }}>{t("common.close")}</Button>
      </ModalFooter>
    </Modal>
  );
}
