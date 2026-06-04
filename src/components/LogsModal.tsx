import { useEffect, useRef, useMemo } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Spinner,
} from "@patternfly/react-core";
import { type ComposeStack } from "../api";
import {
  serviceColor,
  highlightMessage,
  parseLine,
  type ParsedLine,
} from "../lib/logParser";
import { useLogStream, LOG_MAX_LINES } from "../hooks/useLogStream";
import "./LogsModal.css";

// ── LogLine component ──────────────────────────────────────────────────────────

function LogLine({ parsed, index }: { parsed: ParsedLine; index: number }) {
  const isEven = index % 2 === 0;

  if (!parsed.service) {
    return (
      <div className={`lm-line-raw ${isEven ? "lm-bg-even" : "lm-bg-odd"}`}>
        {parsed.raw}
      </div>
    );
  }

  const bgClass = parsed.level === "error" ? "lm-bg-error"
    : parsed.level === "warn" ? "lm-bg-warn"
    : isEven ? "lm-bg-even" : "lm-bg-odd";

  const msgClass = parsed.level === "error" ? "lm-msg-error"
    : parsed.level === "warn" ? "lm-msg-warn"
    : "lm-msg-default";

  return (
    <div className="lm-line-parsed">
      <span className={`lm-line-service ${bgClass}`} style={{ color: serviceColor(parsed.service) }}>
        {parsed.service}
      </span>
      <span className={`lm-line-timestamp ${bgClass}`}>{parsed.timestamp}</span>
      <span className={`lm-line-message ${msgClass} ${bgClass}`}>
        {highlightMessage(parsed.message)}
      </span>
    </div>
  );
}

// ── LogsModal ──────────────────────────────────────────────────────────────────

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function LogsModal({ stack, onClose }: Props) {
  const { lines, streaming, paused, pause, resume, restart, clear } = useLogStream(stack.Name);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, paused]);

  const parsedLines = useMemo(() => {
    const parsed = lines.map(parseLine);
    parsed.sort((a, b) => {
      const ta = a.raw.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/)?.[0] ?? "";
      const tb = b.raw.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/)?.[0] ?? "";
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    return parsed;
  }, [lines]);

  return (
    <Modal isOpen onClose={onClose} variant="large" width="95vw" maxWidth="95vw" aria-label={`Logs — ${stack.Name}`}>
      <ModalHeader title={`Logs — ${stack.Name}`} />
      <ModalBody>
        <Toolbar style={{ paddingInline: 0, marginBottom: "0.5rem" }}>
          <ToolbarContent>
            {streaming && !paused && (
              <ToolbarItem><Spinner size="sm" /></ToolbarItem>
            )}
            {streaming && (
              <ToolbarItem>
                {paused
                  ? <Button variant="primary" size="sm" onClick={resume}>Continue</Button>
                  : <Button variant="secondary" size="sm" onClick={pause}>Pause</Button>
                }
              </ToolbarItem>
            )}
            <ToolbarItem>
              <Button variant="secondary" size="sm" onClick={restart}>Refresh</Button>
            </ToolbarItem>
            {lines.length > 0 && (
              <ToolbarItem>
                <Button variant="plain" size="sm" onClick={clear}>Clear</Button>
              </ToolbarItem>
            )}
            {lines.length >= LOG_MAX_LINES && (
              <ToolbarItem>
                <span className="lm-limit-notice">showing last {LOG_MAX_LINES} lines</span>
              </ToolbarItem>
            )}
          </ToolbarContent>
        </Toolbar>

        <div ref={logRef} className="lm-log-viewer">
          {parsedLines.length === 0 ? (
            <div className="lm-empty-state">Waiting for logs…</div>
          ) : (
            parsedLines.map((p, i) => <LogLine key={i} parsed={p} index={i} />)
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
