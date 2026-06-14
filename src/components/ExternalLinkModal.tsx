import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
} from "@patternfly/react-core";

interface Props {
  url: string;
  onClose: () => void;
}

export function ExternalLinkModal({ url, onClose }: Props) {
  const { t } = useTranslation();

  function handleContinue() {
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  }

  return (
    <Modal isOpen onClose={onClose} variant="small" aria-label={t("external_link_modal.aria_label")}>
      <ModalHeader title={t("external_link_modal.title")} />
      <ModalBody>
        <Alert variant="warning" isInline isPlain title={t("external_link_modal.warning_title")} />
        <p style={{ marginTop: "var(--pf-t--global--spacer--md)", wordBreak: "break-all" }}>
          {url}
        </p>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleContinue}>
          {t("common.continue")}
        </Button>
        <Button variant="link" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
