import { useTranslation } from "react-i18next";
import { Modal, ModalHeader, ModalBody, Button } from "@patternfly/react-core";
import { LogViewer } from "@rxtx4816/cockpit-plugin-base-react/components";
import { useBackgroundTasks, type BackgroundTask } from "../hooks/useBackgroundTasks";

interface Props {
  task: BackgroundTask;
  onClose: () => void;
}

export function BackgroundTaskLogModal({ task, onClose }: Props) {
  const { t } = useTranslation();
  const { stop } = useBackgroundTasks();
  const running = task.status === "running" || task.status === "pending";

  return (
    <Modal isOpen onClose={onClose} variant="medium" aria-label={task.label}>
      <ModalHeader title={task.label} />
      <ModalBody>
        <LogViewer
          lines={task.lines}
          error={task.status === "error" ? task.errorMsg : null}
          emptyMessage={t("background_tasks.log_empty")}
        />
        <div className="btd-log-footer">
          {running
            ? <Button variant="danger" onClick={() => stop(task.id)}>{t("background_tasks.stop_button")}</Button>
            : <Button variant="primary" onClick={onClose}>{t("common.close")}</Button>
          }
        </div>
      </ModalBody>
    </Modal>
  );
}
