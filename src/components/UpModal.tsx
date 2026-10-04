import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Spinner,
} from "@patternfly/react-core";
import { LogViewer } from "@rxtx4816/cockpit-plugin-base-react/components";
import { ComposeWarnings } from "./ComposeWarnings";
import { type ComposeStack } from "../api";
import { useUpStream } from "../hooks/useUpStream";
import { useBackgroundTasks } from "../hooks/useBackgroundTasks";
import { buildUpStarter } from "../lib/backgroundActions";
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
  const { lines, done, failed, errorMsg, cancel, detach } = useUpStream(stack.Name, configFiles, profiles);
  const { enqueue, adopt } = useBackgroundTasks();

  // Hands the run to the background task queue. The same process carries on rather
  // than being cancelled and launched again, since a second `compose up` collides with
  // containers the first already created and reports a failure for a stack that is in
  // fact running (#319). Only when nothing has launched yet (superuser access still
  // resolving) is there nothing to adopt, and starting afresh is safe.
  const handleBackground = () => {
    const label = t("up_modal.background_label", { name: stack.Name });
    const handed = detach();
    if (handed) {
      adopt(stack.Name, "up", label, handed.proc, lines.map(l => l.text), handed.pending);
    } else {
      cancel();
      enqueue(stack.Name, "up", label, buildUpStarter(stack, profiles));
    }
    onClose(true);
  };

  // Only the Cancel button aborts a run in flight. Dismissing the dialog any other way
  // (its X, Escape) while compose is still working used to cancel it too, silently
  // discarding an Up the user had confirmed (#272); it now moves to the background.
  const handleDismiss = () => {
    if (done) onClose(!failed);
    else handleBackground();
  };

  const handleCancel = () => {
    cancel();
    onClose(false);
  };

  return (
    <Modal isOpen onClose={handleDismiss} variant="medium" aria-label={t("up_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("up_modal.title", { name: stack.Name })} />
      <ModalBody>
        <div className="um-header">
          {!done && <Spinner size="sm" />}
          {!done && <span className="um-status-running">{t("up_modal.starting", { name: stack.Name })}</span>}
          {done && !failed && <span className="um-status-ok">{t("up_modal.complete")}</span>}
          {done && failed && <span className="um-status-failed">{t("up_modal.failed")}</span>}
        </div>

        <ComposeWarnings lines={lines.map(l => l.text)} />

        <LogViewer
          lines={lines.map(l => l.text)}
          error={done && failed ? errorMsg : null}
          emptyMessage={t("up_modal.initializing")}
        />

        <div className="um-footer">
          {!done
            ? (
              <>
                <Button variant="secondary" onClick={handleBackground}>{t("up_modal.background_button")}</Button>
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
