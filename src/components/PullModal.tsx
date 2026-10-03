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
import { usePullStream } from "../hooks/usePullStream";
import { useBackgroundTasks } from "../hooks/useBackgroundTasks";
import { buildPullStarter } from "../lib/backgroundActions";
import "./PullModal.css";
import { splitConfigFiles } from "../lib/configFiles";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function PullModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const configFiles = splitConfigFiles(stack.ConfigFiles);
  const { lines, done, failed, errorMsg, cancel, detach } = usePullStream(stack.Name, configFiles);
  const { enqueue, adopt } = useBackgroundTasks();

  // Same handover as UpModal: the background task adopts the running pull instead
  // of cancelling it and downloading everything again.
  const handleBackground = () => {
    const label = t("pull_modal.background_label", { name: stack.Name });
    const handed = detach();
    if (handed) {
      adopt(stack.Name, "pull", label, handed.proc, lines.map(l => l.text), handed.pending);
    } else {
      cancel();
      enqueue(stack.Name, "pull", label, buildPullStarter(stack));
    }
    onClose();
  };

  // Only the Cancel button aborts; dismissing a pull still in flight backgrounds it.
  const handleDismiss = () => {
    if (done) onClose();
    else handleBackground();
  };

  const handleCancel = () => {
    cancel();
    onClose();
  };

  return (
    <Modal isOpen onClose={handleDismiss} variant="medium" aria-label={t("pull_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("pull_modal.title", { name: stack.Name })} />
      <ModalBody>
        <div className="pm-header">
          {!done && <Spinner size="sm" />}
          {!done && <span className="pm-status-running">{t("pull_modal.pulling", { name: stack.Name })}</span>}
          {done && !failed && <span className="pm-status-ok">{t("pull_modal.complete")}</span>}
          {done && failed && <span className="pm-status-failed">{t("pull_modal.failed")}</span>}
        </div>

        <LogViewer
          lines={lines.map(l => l.text)}
          error={done && failed ? errorMsg : null}
          emptyMessage={t("pull_modal.starting")}
        />

        <div className="pm-footer">
          {!done
            ? (
              <>
                <Button variant="secondary" onClick={handleBackground}>{t("pull_modal.background_button")}</Button>
                <Button variant="secondary" onClick={handleCancel}>{t("common.cancel")}</Button>
              </>
            )
            : <Button variant="primary" onClick={handleDismiss}>{t("common.close")}</Button>
          }
        </div>
      </ModalBody>
    </Modal>
  );
}
