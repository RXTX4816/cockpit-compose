import { useEffect, useRef } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Spinner,
  Alert,
} from "@patternfly/react-core";
import { type ComposeStack } from "../api";
import { kindColor } from "../lib/pullParser";
import { usePullStream } from "../hooks/usePullStream";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function PullModal({ stack, onClose }: Props) {
  const configFile = stack.ConfigFiles.split(",")[0].trim();
  const { lines, done, failed, errorMsg, cancel } = usePullStream(stack.Name, configFile);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const handleClose = () => {
    cancel();
    onClose();
  };

  return (
    <Modal isOpen onClose={handleClose} variant="medium" aria-label={`Pull — ${stack.Name}`}>
      <ModalHeader title={`Pull — ${stack.Name}`} />
      <ModalBody>
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

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
          {!done ? (
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          ) : (
            <Button variant="primary" onClick={handleClose}>Close</Button>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
