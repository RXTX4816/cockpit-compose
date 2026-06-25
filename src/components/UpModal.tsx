import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Spinner,
} from "@patternfly/react-core";
import { LogViewer } from "@rxtx4816/cockpit-plugin-base-react/components";
import { type ComposeStack } from "../api";
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
          {!done && <span className="um-status-running">{t("up_modal.starting", { name: stack.Name })}</span>}
          {done && !failed && <span className="um-status-ok">{t("up_modal.complete")}</span>}
          {done && failed && <span className="um-status-failed">{t("up_modal.failed")}</span>}
        </div>

        <LogViewer
          lines={lines.map(l => l.text)}
          error={done && failed ? errorMsg : null}
          emptyMessage={t("up_modal.initializing")}
        />

        <div className="um-footer">
          {!done
            ? <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
            : <Button variant="primary" onClick={handleClose}>{t("common.close")}</Button>
          }
        </div>
      </ModalBody>
    </Modal>
  );
}
