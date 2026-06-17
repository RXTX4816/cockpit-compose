import { useTranslation } from "react-i18next";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@patternfly/react-core";
import { BanIcon } from "@patternfly/react-icons";
import { type ComposeStack } from "../api";

interface Props {
  target: ComposeStack;
  killing: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function KillModal({ target, killing, error, onConfirm, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen
      variant="small"
      onClose={() => { if (!killing) onClose(); }}
      aria-label={t("kill_modal.aria_label")}
    >
      <ModalHeader title={t("kill_modal.title", { name: target.Name })} />
      <ModalBody>
        <p>
          {t("kill_modal.body_prefix")} <code>docker compose kill</code>{" "}
          {t("kill_modal.body_sigkill")} <strong>{target.Name}</strong>{t("kill_modal.body_suffix")}
        </p>
        {error && <Alert variant="danger" isInline title={error} style={{ marginTop: "1rem" }} />}
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" icon={<BanIcon />} onClick={onConfirm} isLoading={killing}>
          {t("kill_modal.confirm_button")}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={killing}>
          {t("common.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
