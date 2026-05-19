import { useState, useEffect, useRef, useMemo } from "react";
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
import { type ComposeStack, streamLogs } from "../api";
import {
  serviceColor,
  highlightMessage,
  parseLine,
  type ParsedLine,
} from "../lib/logParser";

const MAX_LINES = 500;

// ── LogLine component ──────────────────────────────────────────────────────────

const lineBg: Record<string, string> = {
  error: "rgba(248, 81, 73, 0.10)",
  warn:  "rgba(227, 179, 65, 0.08)",
};

function LogLine({ parsed, index }: { parsed: ParsedLine; index: number }) {
  const isEven = index % 2 === 0;

  if (!parsed.service) {
    return (
      <div style={{
        padding: "0.1rem 0.75rem",
        fontFamily: "var(--pf-t--global--font--family--mono)",
        fontSize: "0.78rem",
        lineHeight: "1.5",
        color: "#6e7681",
        fontStyle: "italic",
        background: isEven ? "transparent" : "rgba(255,255,255,0.015)",
      }}>
        {parsed.raw}
      </div>
    );
  }

  const bg = parsed.level && lineBg[parsed.level]
    ? lineBg[parsed.level]
    : isEven ? "transparent" : "rgba(255,255,255,0.015)";

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "10rem 5.5rem 1fr",
      gap: "0 0.5rem",
      padding: "0.1rem 0.75rem",
      fontFamily: "var(--pf-t--global--font--family--mono)",
      fontSize: "0.78rem",
      lineHeight: "1.5",
      background: bg,
    }}>
      {/* service — colored by hash, always distinct */}
      <span style={{
        color: serviceColor(parsed.service),
        fontWeight: 600,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {parsed.service}
      </span>

      {/* timestamp — always muted grey, never inherits line color */}
      <span style={{
        color: "#6e7681",
        fontSize: "0.7rem",
        alignSelf: "center",
        whiteSpace: "nowrap",
      }}>
        {parsed.timestamp}
      </span>

      {/* message — base color depends on level, tokens highlighted inline */}
      <span style={{
        wordBreak: "break-all",
        color: parsed.level === "error" ? "#f85149"
             : parsed.level === "warn"  ? "#e3b341"
             : "#e6edf3",
      }}>
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
  const [lines, setLines] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(true);
  const procRef = useRef<CockpitProcess | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const bufRef = useRef("");

  useEffect(() => {
    bufRef.current = "";
    setLines([]);
    const proc = streamLogs(stack.Name);
    procRef.current = proc;
    proc.stream(data => {
      bufRef.current += data;
      const parts = bufRef.current.split("\n");
      bufRef.current = parts.pop() ?? "";
      if (parts.length > 0) {
        setLines(prev => {
          const next = [...prev, ...parts.filter(Boolean)];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
      }
    });
    proc.then(() => setStreaming(false)).catch(() => setStreaming(false));
    return () => { proc.close(); };
  }, [stack.Name]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const parsedLines = useMemo(() => lines.map(parseLine), [lines]);

  const stop = () => {
    procRef.current?.close();
    procRef.current = null;
    setStreaming(false);
  };

  return (
    <Modal isOpen onClose={onClose} variant="large" aria-label={`Logs — ${stack.Name}`}>
      <ModalHeader title={`Logs — ${stack.Name}`} />
      <ModalBody>
        <Toolbar style={{ paddingInline: 0, marginBottom: "0.5rem" }}>
          <ToolbarContent>
            {streaming && (
              <>
                <ToolbarItem><Spinner size="sm" /></ToolbarItem>
                <ToolbarItem>
                  <Button variant="secondary" size="sm" onClick={stop}>Stop</Button>
                </ToolbarItem>
              </>
            )}
            {lines.length > 0 && (
              <ToolbarItem>
                <Button variant="plain" size="sm" onClick={() => setLines([])}>Clear</Button>
              </ToolbarItem>
            )}
            {lines.length >= MAX_LINES && (
              <ToolbarItem>
                <span style={{ fontSize: "0.75rem", color: "#6e7681" }}>
                  showing last {MAX_LINES} lines
                </span>
              </ToolbarItem>
            )}
          </ToolbarContent>
        </Toolbar>

        <div
          ref={logRef}
          style={{
            overflowY: "auto",
            height: "62vh",
            padding: "0.4rem 0",
            background: "#0d1117",
            borderRadius: "var(--pf-t--global--border--radius--200)",
          }}
        >
          {parsedLines.length === 0 ? (
            <div style={{
              padding: "1rem 0.75rem",
              color: "#6e7681",
              fontFamily: "var(--pf-t--global--font--family--mono)",
              fontSize: "0.78rem",
            }}>
              Waiting for logs…
            </div>
          ) : (
            parsedLines.map((p, i) => <LogLine key={i} parsed={p} index={i} />)
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
