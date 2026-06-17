import { useTranslation } from "react-i18next";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "@patternfly/react-core";
import { TimesCircleIcon } from "@patternfly/react-icons";
import { type ComposeStack, type SharedNetwork } from "../api";

interface Props {
  target: ComposeStack;
  downing: boolean;
  error: string | null;
  sharedNetworks: SharedNetwork[];
  networksLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DownModal({ target, downing, error, sharedNetworks, networksLoading, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const sharedOnes = sharedNetworks.filter(n => n.sharedWith.length > 0);

  return (
    <Modal
      isOpen
      variant="small"
      onClose={() => { if (!downing) onClose(); }}
      aria-label={t("down_modal.aria_label")}
    >
      <ModalHeader title={t("down_modal.title", { name: target.Name })} />
      <ModalBody>
        <p>
          {t("down_modal.body_prefix")} <code>docker compose down</code>{" "}
          {t("down_modal.body_suffix")} <strong>{target.Name}</strong>{t("down_modal.body_suffix2")}
        </p>
        {networksLoading && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem", color: "var(--pf-t--global--text--color--subtle)", fontSize: "0.875rem" }}>
            <Spinner size="sm" />
            {t("down_modal.checking_networks")}
          </div>
        )}
        {!networksLoading && sharedOnes.length > 0 && (
          <Alert variant="warning" isInline title={t("down_modal.shared_networks_title")} style={{ marginTop: "1rem" }}>
            <ul style={{ margin: "0.25rem 0 0 1.25rem", padding: 0 }}>
              {sharedOnes.map(n => (
                <li key={n.name}>
                  <code>{n.name}</code>
                  {" — "}{t("down_modal.shared_with")}{" "}
                  <strong>{n.sharedWith.join(", ")}</strong>
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {error && <Alert variant="danger" isInline title={error} style={{ marginTop: "1rem" }} />}
      </ModalBody>
      <ModalFooter>
        <Button variant="danger" icon={<TimesCircleIcon />} onClick={onConfirm} isLoading={downing}>
          {t("down_modal.confirm_button")}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={downing}>
          {t("common.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
