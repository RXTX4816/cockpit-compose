import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
  Checkbox,
} from "@patternfly/react-core";
import { removeFile, removeDirectory } from "../api";
import { type DownedStack } from "../hooks/useDownedStacksScan";

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

  const folderPath = stack.configFile.slice(0, stack.configFile.lastIndexOf("/"));
  const target = deleteFolder
    ? t("delete_modal.target_folder", { folder: folderPath })
    : t("delete_modal.target_file", { file: stack.configFile });

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      if (deleteFolder) {
        await removeDirectory(folderPath);
      } else {
        await removeFile(stack.configFile);
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

          <p style={{ marginBottom: "0.75rem", fontSize: "0.875rem" }}>
            {t("delete_modal.compose_file_label")} <code>{stack.configFile}</code>
          </p>

          <Checkbox
            id="dsm-delete-folder"
            label={t("delete_modal.delete_folder_label")}
            description={t("delete_modal.delete_folder_description", { folder: folderPath })}
            isChecked={deleteFolder}
            onChange={(_e, checked) => setDeleteFolder(checked)}
          />

          {error && (
            <Alert variant="danger" isInline title={error} style={{ marginTop: "1rem" }} />
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="danger" onClick={() => setConfirmed(true)}>
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
