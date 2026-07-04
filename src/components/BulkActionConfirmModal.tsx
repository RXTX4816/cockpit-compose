import { useTranslation } from "react-i18next";
import { Modal, ModalHeader, ModalBody, ModalFooter, Button, Alert } from "@patternfly/react-core";
import { type ComposeStack } from "../api";

export type BulkAction = "up" | "pull" | "restart" | "down" | "kill";

interface Props {
  stacks: ComposeStack[];
  action: BulkAction;
  onConfirm: () => void;
  onClose: () => void;
}

const DESTRUCTIVE_ACTIONS: BulkAction[] = ["down", "kill"];
const MINOR_WARNING_ACTIONS: BulkAction[] = ["up", "restart"];

export function BulkActionConfirmModal({ stacks, action, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const isDestructive = DESTRUCTIVE_ACTIONS.includes(action);

  return (
    <Modal isOpen onClose={onClose} variant="small" aria-label={t("bulk_confirm_modal.aria_label")}>
      <ModalHeader title={t(`bulk_confirm_modal.title_${action}`, { count: stacks.length })} />
      <ModalBody>
        {isDestructive && (
          <Alert
            variant="danger"
            isInline
            title={t(`bulk_confirm_modal.warning_${action}_title`)}
            style={{ marginBottom: "1rem" }}
          >
            {t(`bulk_confirm_modal.warning_${action}_body`)}
          </Alert>
        )}
        {MINOR_WARNING_ACTIONS.includes(action) && (
          <Alert
            variant="warning"
            isInline
            title={t(`bulk_confirm_modal.warning_${action}`)}
            style={{ marginBottom: "1rem" }}
          />
        )}
        <Alert variant="info" isInline title={t("bulk_confirm_modal.background_notice")} style={{ marginBottom: "1rem" }} />
        <p>{t("bulk_confirm_modal.stacks_label")}</p>
        <ul>
          {stacks.map(s => <li key={s.Name}>{s.Name}</li>)}
        </ul>
      </ModalBody>
      <ModalFooter>
        <Button variant={isDestructive ? "danger" : "primary"} onClick={onConfirm}>
          {t(`bulk_confirm_modal.confirm_button_${action}`)}
        </Button>
        <Button variant="link" onClick={onClose}>{t("common.cancel")}</Button>
      </ModalFooter>
    </Modal>
  );
}
