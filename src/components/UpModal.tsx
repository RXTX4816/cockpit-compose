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
  const { lines, done, failed, errorMsg, cancel } = useUpStream(stack.Name, configFiles, profiles);
  const { enqueue } = useBackgroundTasks();

  // Two very different intents share this handler: aborting a run still in flight
  // (the Cancel button, and the modal's X while !done), and dismissing one that has
  // already finished (the Close button). Only the first should touch the channel.
  //
  // Cancelling a finished stream is meant to be a no-op — useAsyncStream nulls its
  // process ref in the same callback that sets `done` — but #272 reports Up work being
  // discarded by exactly this call on some VMs, so stop relying on that contract from
  // here. Dismissing a completed run has no reason to close a channel at all.
  const handleClose = () => {
    if (!done) cancel();
    onClose(done && !failed);
  };

  const handleBackground = () => {
    // Deliberately unconditional: this hands the run to the background task, which
    // re-launches it with its own process, so this modal's channel must go.
    cancel();
    enqueue(stack.Name, "up", t("up_modal.background_label", { name: stack.Name }), buildUpStarter(stack, profiles));
    onClose(true);
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
            ? (
              <>
                <Button variant="secondary" onClick={handleBackground}>{t("up_modal.background_button")}</Button>
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
