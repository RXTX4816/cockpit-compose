import { useState, useEffect, useRef } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Spinner,
  Alert,
} from "@patternfly/react-core";
import { type ComposeStack, pullStack } from "../api";
import { stripAnsi, classifyLine, kindColor, type LineEntry } from "../lib/pullParser";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function PullModal({ stack, onClose }: Props) {
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const bufRef = useRef("");
  const procRef = useRef<CockpitProcess | null>(null);

  const configFile = stack.ConfigFiles.split(",")[0].trim();

  useEffect(() => {
    const proc = pullStack(stack.Name, configFile);
    procRef.current = proc;

    proc.stream(data => {
      // Strip ANSI, then handle \r (terminal overwrite) within each chunk
      const clean = stripAnsi(data);
      bufRef.current += clean;

      // Split on newlines; keep incomplete last line in buffer
      const parts = bufRef.current.split("\n");
      bufRef.current = parts.pop() ?? "";

      const newLines: LineEntry[] = parts
        // Handle \r within a line — take the last segment (what would be shown in terminal)
        .map(line => line.split("\r").pop() ?? "")
        .filter(line => line.trim() !== "")
        .map(text => ({ text, kind: classifyLine(text) }));

      if (newLines.length > 0) {
        setLines(prev => [...prev, ...newLines]);
      }
    });

    proc
      .then(() => { setDone(true); setFailed(false); })
      .catch((ex: unknown) => {
        setDone(true);
        setFailed(true);
        setErrorMsg(ex instanceof Error ? ex.message : String(ex));
      });

    return () => { proc.close(); };
  }, [stack.Name, configFile]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  const cancel = () => {
    procRef.current?.close();
    onClose();
  };

  return (
    <Modal isOpen onClose={cancel} variant="medium" aria-label={`Pull — ${stack.Name}`}>
      <ModalHeader title={`Pull — ${stack.Name}`} />
      <ModalBody>
        {/* Status bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "0.6rem",
          marginBottom: "0.75rem",
          fontSize: "0.875rem",
        }}>
          {!done && <Spinner size="sm" />}
          {!done && (
            <span style={{ color: "var(--pf-t--global--text--color--subtle)" }}>
              Pulling images for <strong>{stack.Name}</strong>…
            </span>
          )}
          {done && !failed && (
            <span style={{ color: "#56d364", fontWeight: 600 }}>✓ Pull complete</span>
          )}
          {done && failed && (
            <span style={{ color: "#f85149", fontWeight: 600 }}>✗ Pull failed</span>
          )}
        </div>

        {done && failed && errorMsg && (
          <Alert variant="danger" isInline title={errorMsg} style={{ marginBottom: "0.75rem" }} />
        )}

        {/* Log output */}
        <div
          ref={logRef}
          style={{
            overflowY: "auto",
            height: "50vh",
            padding: "0.6rem 0.75rem",
            background: "var(--pf-t--global--background--color--secondary--default)",
            borderRadius: "var(--pf-t--global--border--radius--200)",
            fontFamily: "var(--pf-t--global--font--family--mono)",
            fontSize: "0.78rem",
            lineHeight: "1.55",
          }}
        >
          {lines.length === 0 ? (
            <span style={{ color: "var(--pf-t--global--text--color--subtle)" }}>
              Starting pull…
            </span>
          ) : (
            lines.map((entry, i) => (
              <div key={i} style={{ color: kindColor[entry.kind] }}>
                {entry.text}
              </div>
            ))
          )}
        </div>

        {/* Footer buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
          {!done ? (
            <Button variant="secondary" onClick={cancel}>Cancel</Button>
          ) : (
            <Button variant="primary" onClick={onClose}>Close</Button>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
