import { useState } from "react";
import { ArchiveIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
  Checkbox,
  Form,
  FormGroup,
  TextInput,
} from "@patternfly/react-core";
import { type ComposeStack } from "../api";
import { createBackupArchive } from "../api/files";
import { splitConfigFiles } from "../lib/configFiles";
import { formatArchiveTimestamp } from "@rxtx4816/cockpit-plugin-base-react/lib/timestamp";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function BackupModal({ stack, onClose }: Props) {
  const { t } = useTranslation();

  const primaryConfigFile = splitConfigFiles(stack.ConfigFiles)[0] ?? "";
  const stackDir = primaryConfigFile.substring(0, primaryConfigFile.lastIndexOf("/"));
  const dirName = stackDir.substring(stackDir.lastIndexOf("/") + 1);
  const stackParentDir = stackDir.substring(0, stackDir.lastIndexOf("/"));

  const [baseName, setBaseName] = useState(stack.Name);
  const [destDir, setDestDir] = useState(stackParentDir || stackDir);
  const [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [includeSubdirs, setIncludeSubdirs] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const archiveFilename = `${baseName || stack.Name}-${formatArchiveTimestamp(new Date())}.bak.tar.gz`;
  const destPath = `${destDir.replace(/\/$/, "")}/${archiveFilename}`;

  async function handleCreate() {
    setRunning(true);
    setError(null);
    setWarning(null);
    const timestamp = formatArchiveTimestamp(new Date());
    const filename = `${baseName || stack.Name}-${timestamp}.bak.tar.gz`;
    const fullDestPath = `${destDir.replace(/\/$/, "")}/${filename}`;
    try {
      const { warning } = await createBackupArchive(stackParentDir || stackDir, dirName, fullDestPath, {
        includeSnapshots,
        includeSubdirs,
      });
      setSavedPath(fullDestPath);
      if (warning) setWarning(warning);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} variant="small" aria-label={t("backup_modal.title", { name: stack.Name })}>
      <ModalHeader title={t("backup_modal.title", { name: stack.Name })} />
      <ModalBody>
        {savedPath ? (
          <>
            <Alert variant="success" isInline title={t("backup_modal.success_title")}>
              {t("backup_modal.success_body", { path: savedPath })}
            </Alert>
            {warning && (
              <Alert variant="warning" isInline title={t("backup_modal.warning_partial")} style={{ marginTop: "0.5rem" }}>
                {warning}
              </Alert>
            )}
          </>
        ) : (
          <Form isHorizontal>
            <FormGroup label={t("backup_modal.base_name_label")} fieldId="bm-base-name">
              <TextInput
                id="bm-base-name"
                value={baseName}
                onChange={(_e, v) => setBaseName(v)}
                isDisabled={running}
              />
            </FormGroup>
            <FormGroup label={t("backup_modal.archive_preview_label")} fieldId="bm-preview">
              <TextInput id="bm-preview" value={destPath} isDisabled readOnly />
            </FormGroup>
            <FormGroup label={t("backup_modal.dest_dir_label")} fieldId="bm-dest-dir">
              <TextInput
                id="bm-dest-dir"
                value={destDir}
                onChange={(_e, v) => setDestDir(v)}
                isDisabled={running}
              />
            </FormGroup>
            <FormGroup label=" " fieldId="bm-options">
              <Checkbox
                id="bm-snapshots"
                label={t("backup_modal.include_snapshots_label")}
                isChecked={includeSnapshots}
                onChange={(_e, v) => setIncludeSnapshots(v)}
                isDisabled={running}
              />
              <Checkbox
                id="bm-subdirs"
                label={
                  <span>
                    {t("backup_modal.include_subdirs_label")}
                    {" "}
                    <span style={{ color: "var(--pf-t--global--text--color--subtle)", fontSize: "0.85em" }}>
                      {t("backup_modal.include_subdirs_note")}
                    </span>
                  </span>
                }
                isChecked={includeSubdirs}
                onChange={(_e, v) => setIncludeSubdirs(v)}
                isDisabled={running}
              />
            </FormGroup>
            {error && (
              <Alert variant="danger" isInline title={error} />
            )}
          </Form>
        )}
      </ModalBody>
      <ModalFooter>
        {savedPath ? (
          <Button variant="primary" onClick={onClose}>{t("common.close")}</Button>
        ) : (
          <>
            <Button
              variant="primary"
              icon={<ArchiveIcon />}
              onClick={() => void handleCreate()}
              isLoading={running}
              isDisabled={running || !baseName.trim() || !destDir.trim()}
            >
              {t("backup_modal.create_button")}
            </Button>
            <Button variant="link" onClick={onClose} isDisabled={running}>
              {t("common.cancel")}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
