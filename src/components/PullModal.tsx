import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Spinner,
} from "@patternfly/react-core";
import { LogViewer } from "@rxtx4816/cockpit-plugin-base-react/components";
import { type ComposeStack, pullStack, composeFileSuperuser, isRootlessMode, readAllProfiles } from "../api";
import { usePullStream } from "../hooks/usePullStream";
import { useBackgroundTasks } from "../hooks/useBackgroundTasks";
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
  const { enqueue } = useBackgroundTasks();

  const handleClose = () => {
    cancel();
    onClose();
  };

  const handleBackground = () => {
    cancel();
    enqueue(stack.Name, "pull", t("pull_modal.background_label", { name: stack.Name }), launch => {
      return Promise.all([
        isRootlessMode() ? Promise.resolve(undefined) : composeFileSuperuser(configFiles),
        readAllProfiles(configFiles[0]),
      ]).then(([su, profiles]) => { launch(pullStack(stack.Name, configFiles, profiles, su)); });
    });
    onClose();
  };

  return (
    <Modal isOpen onClose={handleClose} variant="medium" aria-label={t("pull_modal.aria_label", { name: stack.Name })}>
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
                <Button variant="secondary" onClick={handleClose}>{t("common.cancel")}</Button>
              </>
            )
            : <Button variant="primary" onClick={handleClose}>{t("common.close")}</Button>
          }
        </div>
      </ModalBody>
    </Modal>
  );
}
