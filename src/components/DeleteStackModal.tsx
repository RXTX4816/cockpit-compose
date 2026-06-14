import { useState } from "react";
import { TrashIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
  Checkbox,
  Spinner,
} from "@patternfly/react-core";
import { removeFile, removeDirectory } from "../api";
import { type DownedStack } from "../hooks/useDownedStacksScan";
import { useSharedNetworks } from "../hooks/useSharedNetworks";

interface Props {
  stack: DownedStack;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteStackModal({ stack, onClose, onDeleted }: Props) {
  const { t } = useTranslation();
  const [deleteFolder, setDeleteFolder] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { sharedNetworks, loading: loadingNetworks } = useSharedNetworks(stack.name, true);
  const sharedOnes = sharedNetworks.filter(n => n.sharedWith.length > 0);

  const folderPath = stack.configFiles[0].slice(0, stack.configFiles[0].lastIndexOf("/"));
  const target = deleteFolder
    ? t("delete_modal.target_folder", { folder: folderPath })
    : stack.configFiles.length === 1
      ? t("delete_modal.target_file", { file: stack.configFiles[0] })
      : t("delete_modal.target_files", { count: stack.configFiles.length });

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      if (deleteFolder) {
        await removeDirectory(folderPath);
      } else {
        for (const f of stack.configFiles) {
          await removeFile(f);
        }
      }
      onDeleted();
      onClose();
    } catch (ex: unknown) {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setError(msg || t("delete_modal.error_default"));
      setConfirmed(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        variant="small"
        aria-label={t("delete_modal.aria_label", { name: stack.name })}
      >
        <ModalHeader title={t("delete_modal.title", { name: stack.name })} />
        <ModalBody>
          <Alert variant="danger" isInline title={t("delete_modal.cannot_undo_title")} style={{ marginBottom: "1rem" }}>
            {t("delete_modal.cannot_undo_body")}
          </Alert>

          <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem" }}>
            <p style={{ margin: "0 0 0.25rem" }}>{t("delete_modal.compose_files_label")}</p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {stack.configFiles.map(f => (
                <li key={f}><code>{f}</code></li>
              ))}
            </ul>
          </div>

          <Checkbox
            id="dsm-delete-folder"
            label={t("delete_modal.delete_folder_label")}
            description={t("delete_modal.delete_folder_description", { folder: folderPath })}
            isChecked={deleteFolder}
            onChange={(_e, checked) => setDeleteFolder(checked)}
          />

          {loadingNetworks && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem", color: "var(--pf-t--global--text--color--subtle)", fontSize: "0.875rem" }}>
              <Spinner size="sm" />
              {t("delete_modal.checking_networks")}
            </div>
          )}
          {!loadingNetworks && sharedOnes.length > 0 && (
            <Alert variant="warning" isInline title={t("delete_modal.shared_networks_title")} style={{ marginTop: "1rem" }}>
              <ul style={{ margin: "0.25rem 0 0 1.25rem", padding: 0 }}>
                {sharedOnes.map(n => (
                  <li key={n.name}>
                    <code>{n.name}</code>
                    {" — "}{t("delete_modal.shared_with")}{" "}
                    <strong>{n.sharedWith.join(", ")}</strong>
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {error && (
            <Alert variant="danger" isInline title={error} style={{ marginTop: "1rem" }} />
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="danger" icon={<TrashIcon />} onClick={() => setConfirmed(true)}>
            {t("common.delete")}
          </Button>
          <Button variant="link" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </ModalFooter>
      </Modal>

      {confirmed && (
        <Modal
          isOpen
          onClose={() => setConfirmed(false)}
          variant="small"
          aria-label={t("delete_modal.confirm_aria_label")}
        >
          <ModalHeader title={t("delete_modal.confirm_title")} />
          <ModalBody>
            <Alert variant="danger" isInline title={t("delete_modal.confirm_warning_title", { target })}>
              {t("delete_modal.confirm_warning_body")}
            </Alert>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="danger"
              icon={<TrashIcon />}
              isDisabled={deleting}
              isLoading={deleting}
              onClick={() => { void handleDelete(); }}
            >
              {t("delete_modal.confirm_button")}
            </Button>
            <Button variant="link" isDisabled={deleting} onClick={() => setConfirmed(false)}>
              {t("common.cancel")}
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
