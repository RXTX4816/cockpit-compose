import { useState, useCallback } from "react";
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
  const [deleteFolder, setDeleteFolder] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folderPath = stack.configFile.slice(0, stack.configFile.lastIndexOf("/"));
  const target = deleteFolder ? `folder ${folderPath}` : `file ${stack.configFile}`;

  const handleDelete = useCallback(async () => {
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
      setError(msg || "Failed to delete");
      setConfirmed(false);
    } finally {
      setDeleting(false);
    }
  }, [deleteFolder, folderPath, stack.configFile, onDeleted, onClose]);

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        variant="small"
        aria-label={`Delete compose stack — ${stack.name}`}
      >
        <ModalHeader title={`Delete — ${stack.name}`} />
        <ModalBody>
          <Alert variant="danger" isInline title="This action cannot be undone" style={{ marginBottom: "1rem" }}>
            The compose file will be permanently deleted from disk.
          </Alert>

          <p style={{ marginBottom: "0.75rem", fontSize: "0.875rem" }}>
            Compose file: <code>{stack.configFile}</code>
          </p>

          <Checkbox
            id="dsm-delete-folder"
            label="Delete entire folder"
            description={`Removes the folder ${folderPath} and all its contents`}
            isChecked={deleteFolder}
            onChange={(_e, checked) => setDeleteFolder(checked)}
          />

          {error && (
            <Alert variant="danger" isInline title={error} style={{ marginTop: "1rem" }} />
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="danger" onClick={() => setConfirmed(true)}>
            Delete
          </Button>
          <Button variant="link" onClick={onClose}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      {confirmed && (
        <Modal
          isOpen
          onClose={() => setConfirmed(false)}
          variant="small"
          aria-label="Confirm delete"
        >
          <ModalHeader title="Are you really sure?" />
          <ModalBody>
            <Alert variant="danger" isInline title={`This will permanently delete the ${target}!`}>
              There is no way to recover this. Make sure you have a backup if needed.
            </Alert>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="danger"
              isDisabled={deleting}
              isLoading={deleting}
              onClick={() => { void handleDelete(); }}
            >
              Yes, delete
            </Button>
            <Button variant="link" isDisabled={deleting} onClick={() => setConfirmed(false)}>
              Cancel
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
