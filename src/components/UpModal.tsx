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
import { useUpStream } from "../hooks/useUpStream";
import "./UpModal.css";
import { splitConfigFiles } from "../lib/configFiles";

interface Props {
  stack: ComposeStack;
  profiles?: string[];
  onClose: (succeeded: boolean) => void;
}

export function UpModal({ stack, profiles = [], onClose }: Props) {
  const { t } = useTranslation();
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  const { lines, done, failed, errorMsg, cancel } = useUpStream(stack.Name, configFiles, profiles);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  const handleClose = () => {
    cancel();
    onClose(done && !failed);
  };

  return (
    <Modal isOpen onClose={handleClose} variant="medium" aria-label={t("up_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("up_modal.title", { name: stack.Name })} />
      <ModalBody>
        <div className="um-header">
          {!done && <Spinner size="sm" />}
          {!done && (
            <span className="um-status-running">
              {t("up_modal.starting", { name: stack.Name })}
            </span>
          )}
          {done && !failed && (
            <span className="um-status-ok">{t("up_modal.complete")}</span>
          )}
          {done && failed && (
            <span className="um-status-failed">{t("up_modal.failed")}</span>
          )}
        </div>

        {done && failed && errorMsg && (
          <Alert variant="danger" isInline title={errorMsg} style={{ marginBottom: "0.75rem" }} />
        )}

        <div ref={logRef} className="um-log-viewer">
          {lines.length === 0 ? (
            <span className="um-log-empty">{t("up_modal.initializing")}</span>
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
            <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
          ) : (
            <Button variant="primary" onClick={handleClose}>{t("common.close")}</Button>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
