import { useRef, useEffect } from "react";
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
      aria-label={`Events — ${stack.Name}`}
    >
      <ModalHeader title={`Events — ${stack.Name}`} />
      <ModalBody>
        <Toolbar className="em-toolbar">
          <ToolbarContent>
            <ToolbarItem>
              {streaming ? (
                <Button variant="secondary" size="sm" onClick={stop}>
                  Stop
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleStart}>
                  Stream events
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
                <Button variant="plain" size="sm" onClick={clear}>Clear</Button>
              </ToolbarItem>
            )}
          </ToolbarContent>
        </Toolbar>

        {error && (
          <Alert variant="danger" isInline title="Error streaming events" style={{ marginTop: "0.5rem" }}>
            {error}
          </Alert>
        )}

        <div className="em-table-wrapper">
          {events.length === 0 && !streaming ? (
            <div className="em-empty">
              {error ? null : <>Press &ldquo;Stream events&rdquo; to start watching.</>}
            </div>
          ) : (
            <table className="em-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Action</th>
                  <th>Service</th>
                  <th>Details</th>
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
        <Button variant="secondary" onClick={() => { stop(); onClose(); }}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}
