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
import { useUpStream } from "../hooks/useUpStream";
import "./UpModal.css";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function UpModal({ stack, onClose }: Props) {
  const configFile = stack.ConfigFiles.split(",")[0].trim();
  const { lines, done, failed, errorMsg, cancel } = useUpStream(stack.Name, configFile);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const handleClose = () => {
    cancel();
    onClose();
  };

  return (
    <Modal isOpen onClose={handleClose} variant="medium" aria-label={`Up — ${stack.Name}`}>
      <ModalHeader title={`Up — ${stack.Name}`} />
      <ModalBody>
        <div className="um-header">
          {!done && <Spinner size="sm" />}
          {!done && (
            <span className="um-status-running">
              Starting {stack.Name}…
            </span>
          )}
          {done && !failed && (
            <span className="um-status-ok">✓ Up complete</span>
          )}
          {done && failed && (
            <span className="um-status-failed">✗ Up failed</span>
          )}
        </div>

        {done && failed && errorMsg && (
          <Alert variant="danger" isInline title={errorMsg} style={{ marginBottom: "0.75rem" }} />
        )}

        <div ref={logRef} className="um-log-viewer">
          {lines.length === 0 ? (
            <span className="um-log-empty">Starting…</span>
          ) : (
            lines.map((entry, i) => (
              <div key={i} style={{ color: kindColor[entry.kind] }}>
                {entry.text}
              </div>
            ))
          )}
        </div>

        <div className="um-footer">
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
