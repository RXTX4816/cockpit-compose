import { useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  TextInput,
  Alert,
} from "@patternfly/react-core";
import { type ConfiguredDirectory } from "../api";

interface DirectoryManagerProps {
  isOpen: boolean;
  onClose: () => void;
  directories: ConfiguredDirectory[];
  onAddDirectory: (path: string) => Promise<void>;
  onRemoveDirectory: (path: string) => Promise<void>;
  loading: boolean;
  error?: string | null;
}

export function DirectoryManager({
  isOpen,
  onClose,
  directories,
  onAddDirectory,
  onRemoveDirectory,
  loading,
  error,
}: DirectoryManagerProps) {
  const [newPath, setNewPath] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newPath.trim()) return;
    setAdding(true);
    try {
      await onAddDirectory(newPath.trim());
      setNewPath("");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (path: string) => {
    await onRemoveDirectory(path);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="medium" aria-label="Add Compose Directories">
      <ModalHeader title="Compose Directories" />
      <ModalBody>
        {error && (
          <Alert variant="danger" isInline title="Error" style={{ marginBottom: "1rem" }}>
            {error}
          </Alert>
        )}

        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
            Add Directory (e.g., ~/compose, /opt/docker)
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <TextInput
              value={newPath}
              onChange={(_e, val) => setNewPath(val)}
              placeholder="~/compose"
              isDisabled={adding || loading}
              onKeyPress={e => {
                if (e.key === "Enter") {
                  void handleAdd();
                }
              }}
            />
            <Button variant="primary" onClick={handleAdd} isLoading={adding} isDisabled={!newPath.trim() || adding || loading}>
              Add
            </Button>
          </div>
          <p style={{ fontSize: "0.875rem", color: "var(--pf-t--global--text--color--subtle)", marginTop: "0.5rem" }}>
            Will recursively scan for docker-compose.yml and compose.yml files
          </p>
        </div>

        {directories.length > 0 && (
          <div>
            <label style={{ display: "block", marginBottom: "0.75rem", fontWeight: 600 }}>
              Configured Directories ({directories.length})
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {directories.map(dir => (
                <div
                  key={dir.path}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem",
                    background: "var(--pf-t--global--background--color--secondary--default)",
                    borderRadius: "var(--pf-t--global--border--radius--200)",
                  }}
                >
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: "0.9rem" }}>{dir.path}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--pf-t--global--text--color--subtle)" }}>
                      Added {new Date(dir.addedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Button variant="plain" onClick={() => void handleRemove(dir.path)} isDisabled={loading || adding}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {directories.length === 0 && (
          <div style={{ padding: "1rem", textAlign: "center", color: "var(--pf-t--global--text--color--subtle)" }}>
            No directories configured yet. Add one to get started!
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} isDisabled={adding || loading}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
}
