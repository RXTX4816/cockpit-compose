import { useCallback, useEffect, useState } from "react";
import { useAsyncAction } from "@rxtx4816/cockpit-plugin-base-react";
import { BroomIcon } from "@patternfly/react-icons";
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
import { listAllImages, listInUseImageIds, pruneImages, parseDockerBytes, formatBytes } from "../api";

interface UnusedImage {
  id: string;
  repoTag: string;
  size: string;
  age: string;
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

async function fetchLines(proc: CockpitProcess): Promise<string[]> {
  let output = "";
  proc.stream((data: string) => { output += data; });
  await proc;
  return output
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

async function findUnusedImages(): Promise<UnusedImage[]> {
  const [allLines, inUseIds] = await Promise.all([
    fetchLines(listAllImages()),
    listInUseImageIds(),
  ]);
  const inUse = new Set(inUseIds);
  return allLines
    .map(line => {
      const [id, repoTag, size, age] = line.split("\t");
      return { id, repoTag, size, age };
    })
    .filter(img => !inUse.has(img.id));
}

export function GlobalPruneModal({ onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [images, setImages] = useState<UnusedImage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    setLoadError(null);
    try {
      setImages(await findUnusedImages());
    } catch (ex: unknown) {
      setLoadError(ex instanceof Error ? ex.message : String(ex));
    }
  }, []);

  useEffect(() => { void loadPreview(); }, [loadPreview]);

  const pruneAction = useCallback(async () => {
    const lines = await fetchLines(pruneImages());
    setResult(lines.join("\n") || t("prune_global.nothing_found"));
    onSuccess();
  }, [onSuccess, t]);

  const { execute: executePrune, loading: pruning, error: pruneError } = useAsyncAction(pruneAction);

  const totalSize = images?.length
    ? formatBytes(images.reduce((sum, img) => sum + parseDockerBytes(img.size), 0))
    : null;

  return (
    <Modal isOpen variant="medium" onClose={() => { if (!pruning) onClose(); }} aria-label={t("prune_global.aria_label")}>
      <ModalHeader title={t("prune_global.title")} />
      <ModalBody>
        <Alert variant="info" isInline title={t("prune_global.body_intro")} style={{ marginBottom: "1rem" }} />

        {result ? (
          <Alert variant="success" isInline title={t("prune_global.result_title")}>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{result}</pre>
          </Alert>
        ) : images === null ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Spinner size="md" />
            <span>{t("prune_global.loading")}</span>
          </div>
        ) : images.length === 0 ? (
          <p>{t("prune_global.nothing_found")}</p>
        ) : (
          <>
            <table className="pf-v6-c-table" style={{ fontSize: "0.875rem", width: "100%" }}>
              <thead>
                <tr>
                  <th>{t("prune_global.column_id")}</th>
                  <th>{t("prune_global.column_repo_tag")}</th>
                  <th>{t("prune_global.column_size")}</th>
                  <th>{t("prune_global.column_age")}</th>
                </tr>
              </thead>
              <tbody>
                {images.map(img => (
                  <tr key={img.id}>
                    <td><code>{img.id.slice(0, 19)}</code></td>
                    <td><code>{img.repoTag}</code></td>
                    <td>{img.size}</td>
                    <td>{img.age}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalSize && <p style={{ marginTop: "0.75rem" }}><strong>{t("prune_global.total_reclaimable", { size: totalSize })}</strong></p>}

            <Alert variant="warning" isInline title={t("prune_global.confirm_title")} style={{ marginTop: "1rem" }}>
              {t("prune_global.confirm_body", { count: images.length })}
            </Alert>
            <Checkbox
              id="prune-global-confirm"
              label={t("prune_global.confirm_checkbox")}
              isChecked={confirmed}
              onChange={(_e, v) => setConfirmed(v)}
              isDisabled={pruning}
              style={{ marginTop: "0.5rem" }}
            />
          </>
        )}

        {loadError && <Alert variant="danger" isInline title={loadError} style={{ marginTop: "1rem" }} />}
        {pruneError && <Alert variant="danger" isInline title={t("prune_global.error_title")} style={{ marginTop: "1rem" }}>{pruneError}</Alert>}
      </ModalBody>
      <ModalFooter>
        {result ? (
          <Button variant="primary" onClick={onClose}>{t("common.close")}</Button>
        ) : (
          <>
            <Button
              variant="danger"
              icon={<BroomIcon />}
              onClick={() => void executePrune()}
              isLoading={pruning}
              isDisabled={pruning || images === null || images.length === 0 || !confirmed}
            >
              {pruning ? t("prune_global.pruning") : t("prune_global.prune_button")}
            </Button>
            <Button variant="link" onClick={onClose} isDisabled={pruning}>
              {t("common.cancel")}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
