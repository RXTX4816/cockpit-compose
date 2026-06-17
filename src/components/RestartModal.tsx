import { useTranslation } from "react-i18next";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core";

interface Props {
  stackName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function RestartModal({ stackName, onConfirm, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal isOpen variant="small" onClose={onClose} aria-label={t("restart_modal.aria_label")}>
      <ModalHeader title={t("restart_modal.title", { name: stackName })} />
      <ModalBody>
        <p>{t("restart_modal.body")}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="warning" onClick={onConfirm}>
          {t("restart_modal.confirm_button")}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
