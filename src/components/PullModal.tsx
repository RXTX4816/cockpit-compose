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
import "./PullModal.css";

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
        <div className="pm-header">
          {!done && <Spinner size="sm" />}
          {!done && (
            <span style={{ color: "var(--pf-t--global--text--color--subtle)" }}>
              Pulling images for <strong>{stack.Name}</strong>…
            </span>
          )}
          {done && !failed && (
            <span className="pm-status-ok">✓ Pull complete</span>
          )}
          {done && failed && (
            <span className="pm-status-failed">✗ Pull failed</span>
          )}
        </div>

        {done && failed && errorMsg && (
          <Alert variant="danger" isInline title={errorMsg} style={{ marginBottom: "0.75rem" }} />
        )}

        <div ref={logRef} className="pm-log-viewer">
          {lines.length === 0 ? (
            <span className="pm-log-empty">Starting pull…</span>
          ) : (
            lines.map((entry, i) => (
              <div key={i} style={{ color: kindColor[entry.kind] }}>
                {entry.text}
              </div>
            ))
          )}
        </div>

        <div className="pm-footer">
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
