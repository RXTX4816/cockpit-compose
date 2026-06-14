import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
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
import { splitConfigFiles } from "../lib/configFiles";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function PullModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  const { lines, done, failed, errorMsg, cancel } = usePullStream(stack.Name, configFiles);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const handleClose = () => {
    cancel();
    onClose();
  };

  return (
    <Modal isOpen onClose={handleClose} variant="medium" aria-label={t("pull_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("pull_modal.title", { name: stack.Name })} />
      <ModalBody>
        <div className="pm-header">
          {!done && <Spinner size="sm" />}
          {!done && (
            <span className="pm-status-running">
              {t("pull_modal.pulling", { name: stack.Name })}
            </span>
          )}
          {done && !failed && (
            <span className="pm-status-ok">{t("pull_modal.complete")}</span>
          )}
          {done && failed && (
            <span className="pm-status-failed">{t("pull_modal.failed")}</span>
          )}
        </div>

        {done && failed && errorMsg && (
          <Alert variant="danger" isInline title={errorMsg} style={{ marginBottom: "0.75rem" }} />
        )}

        <div ref={logRef} className="pm-log-viewer">
          {lines.length === 0 ? (
            <span className="pm-log-empty">{t("pull_modal.starting")}</span>
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
            <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
          ) : (
            <Button variant="primary" onClick={handleClose}>{t("common.close")}</Button>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
