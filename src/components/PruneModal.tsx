import { useState, useCallback } from "react";
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
import {
  type ComposeStack,
  parseStackStatus,
  listProjectContainerImageRefs,
  listImagesByRepo,
  listAllContainerImages,
  removeImages,
  listStoppedContainers,
  listDanglingVolumes,
  listProjectNetworks,
  inspectNetworkContainerCounts,
  pruneContainers,
  pruneVolumes,
  pruneNetworks,
} from "../api";

interface Selection {
  images: boolean;
  containers: boolean;
  volumes: boolean;
  networks: boolean;
}

interface Preview {
  images: string[];
  imageIds: string[];
  containers: string[];
  volumes: string[];
  networks: string[];
}

interface Props {
  stack: ComposeStack;
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

// Strips registry hostname and "library/" prefix so that "docker.io/library/caddy:latest"
// and "caddy:latest" compare equal. Docker/Podman versions differ in whether {{.Image}}
// from "docker ps" and {{.Repository}} from "docker images" return the short or long form.
function normalizeImageRef(ref: string): string {
  const slash = ref.indexOf("/");
  if (slash !== -1) {
    const first = ref.slice(0, slash);
    if (first.includes(".") || first.includes(":")) {
      const rest = ref.slice(slash + 1);
      return rest.startsWith("library/") ? rest.slice("library/".length) : rest;
    }
  }
  return ref;
}

// Finds images belonging to the project's repos that no container (anywhere) currently uses.
// Strategy: get image refs from project containers → extract repos → list all versions of
// those repos → subtract any name that appears in a running-or-stopped container globally.
// Both sides are normalized before comparison to handle short vs. fully-qualified name differences
// between "docker ps {{.Image}}" and "docker images {{.Repository}}:{{.Tag}}".
async function findUnusedProjectImages(project: string): Promise<{ name: string; display: string }[]> {
  const imageRefs = await fetchLines(listProjectContainerImageRefs(project));
  if (imageRefs.length === 0) return [];

  // Strip tag/digest to get the repo name, deduplicate.
  const repos = [...new Set(imageRefs.map(ref => ref.split(":")[0]))];

  // Build sets of in-use image refs from all containers on the host.
  // "docker ps {{.Image}}" sometimes omits the tag (e.g. "caddy" instead of "caddy:latest").
  // We track tagless refs separately so they match any version of that repo, while tagged
  // refs (e.g. "gitea:1.26.2") only block that exact version — leaving older ones visible.
  const rawUsed = await fetchLines(listAllContainerImages());
  const usedExact = new Set<string>();    // normalized "repo:tag" refs
  const usedBareRepo = new Set<string>(); // bare repo names from tagless docker ps output

  for (const ref of rawUsed) {
    const normalized = normalizeImageRef(ref);
    usedExact.add(normalized);
    if (!normalized.includes(":")) usedBareRepo.add(normalized);
  }

  const unused: { name: string; display: string }[] = [];
  for (const repo of repos) {
    const lines = await fetchLines(listImagesByRepo(repo));
    for (const line of lines) {
      const tab = line.indexOf("\t");
      if (tab === -1) continue;
      const name = line.slice(0, tab);       // "repo:tag" (possibly fully qualified)
      const size = line.slice(tab + 1);      // "248MB"
      const normalizedName = normalizeImageRef(name);
      const colon = normalizedName.indexOf(":");
      const bareRepo = colon !== -1 ? normalizedName.slice(0, colon) : normalizedName;
      if (!usedExact.has(normalizedName) && !usedBareRepo.has(bareRepo))
        unused.push({ name, display: `${name} (${size})` });
    }
  }
  return unused;
}

export function PruneModal({ stack, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const status = parseStackStatus(stack.Status);
  const isRunning = status === "running" || status === "partial";

  const [step, setStep] = useState<"select" | "preview">("select");
  const [selection, setSelection] = useState<Selection>({
    images: true,
    containers: true,
    volumes: false,
    networks: false,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pruning, setPruning] = useState(false);
  const [pruneError, setPruneError] = useState<string | null>(null);

  const nothingSelected = !selection.images && !selection.containers && !selection.volumes && !selection.networks;

  const loadPreview = useCallback(async () => {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const [unusedImages, containers, volumes, allNetworks] = await Promise.all([
        selection.images ? findUnusedProjectImages(stack.Name) : Promise.resolve([]),
        selection.containers ? fetchLines(listStoppedContainers(stack.Name)) : Promise.resolve([]),
        selection.volumes ? fetchLines(listDanglingVolumes(stack.Name)) : Promise.resolve([]),
        selection.networks ? fetchLines(listProjectNetworks(stack.Name)) : Promise.resolve([]),
      ]);
      // Exclude networks that have connected containers — docker network prune skips them
      // anyway, but showing them in the preview is misleading (e.g. gitea_gitea while running).
      let networks: string[] = [];
      if (allNetworks.length > 0) {
        const counts = await fetchLines(inspectNetworkContainerCounts(allNetworks));
        networks = counts
          .filter(line => line.endsWith("\t0"))
          .map(line => line.slice(0, line.indexOf("\t")));
      }
      setPreview({
        images: unusedImages.map(i => i.display),
        imageIds: unusedImages.map(i => i.name),
        containers,
        volumes,
        networks,
      });
      setStep("preview");
    } catch (ex: unknown) {
      setPreviewError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setLoadingPreview(false);
    }
  }, [stack.Name, selection]);

  const executePrune = useCallback(async () => {
    setPruning(true);
    setPruneError(null);
    try {
      const tasks: Promise<unknown>[] = [];
      if (selection.images && preview && preview.imageIds.length > 0)
        tasks.push(removeImages(preview.imageIds));
      if (selection.containers) tasks.push(pruneContainers(stack.Name));
      if (selection.volumes) tasks.push(pruneVolumes(stack.Name));
      if (selection.networks) tasks.push(pruneNetworks(stack.Name));
      await Promise.all(tasks);
      onSuccess();
      onClose();
    } catch (ex: unknown) {
      setPruneError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setPruning(false);
    }
  }, [stack.Name, selection, preview, onSuccess, onClose]);

  const toggle = (key: keyof Selection) =>
    setSelection(s => ({ ...s, [key]: !s[key] }));

  if (step === "select") {
    return (
      <Modal isOpen variant="small" onClose={onClose} aria-label={t("prune_modal.aria_label_select", { name: stack.Name })}>
        <ModalHeader title={t("prune_modal.title_select", { name: stack.Name })} />
        <ModalBody>
          {!isRunning && (
            <Alert variant="danger" isInline title={t("prune_modal.not_running_title")} style={{ marginBottom: "1rem" }}>
              {t("prune_modal.not_running_body")}
            </Alert>
          )}
          <Alert variant="warning" isInline title={t("prune_modal.destructive_title")} style={{ marginBottom: "1rem" }}>
            {t("prune_modal.destructive_body")}
          </Alert>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Checkbox
              id="prune-images"
              label={t("prune_modal.images_label")}
              description={t("prune_modal.images_description")}
              isChecked={selection.images}
              onChange={() => toggle("images")}
            />
            <Checkbox
              id="prune-containers"
              label={t("prune_modal.containers_label")}
              description={t("prune_modal.containers_description")}
              isChecked={selection.containers}
              onChange={() => toggle("containers")}
            />
            <Checkbox
              id="prune-volumes"
              label={<span>{t("prune_modal.volumes_label")} <span style={{ color: "var(--pf-t--global--color--status--danger--default)", fontSize: "0.8rem" }}>{t("prune_modal.volumes_warning")}</span></span>}
              description={t("prune_modal.volumes_description")}
              isChecked={selection.volumes}
              onChange={() => toggle("volumes")}
            />
            <Checkbox
              id="prune-networks"
              label={t("prune_modal.networks_label")}
              description={t("prune_modal.networks_description")}
              isChecked={selection.networks}
              onChange={() => toggle("networks")}
            />
          </div>

          {previewError && (
            <Alert variant="danger" isInline title={previewError} style={{ marginTop: "1rem" }} />
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="primary"
            onClick={() => void loadPreview()}
            isDisabled={nothingSelected || loadingPreview}
            isLoading={loadingPreview}
          >
            {t("prune_modal.preview_button")} →
          </Button>
          <Button variant="link" onClick={onClose} isDisabled={loadingPreview}>
            {t("common.cancel")}
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal isOpen variant="medium" onClose={() => { if (!pruning) onClose(); }} aria-label={t("prune_modal.aria_label_preview", { name: stack.Name })}>
      <ModalHeader title={t("prune_modal.title_preview")} />
      <ModalBody>
        {!isRunning && (
          <Alert
            variant="danger"
            isInline
            title={t("prune_modal.not_running_title")}
            style={{ marginBottom: "1rem" }}
          >
            {t("prune_modal.not_running_preview_body")}
          </Alert>
        )}

        {loadingPreview ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
            <Spinner />
          </div>
        ) : preview && (
          <div style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {selection.images && (
              <ResourceSection title={t("prune_modal.images_label")} items={preview.images} nothingLabel={t("prune_modal.nothing_to_remove")} />
            )}
            {selection.containers && (
              <ResourceSection title={t("prune_modal.containers_label")} items={preview.containers} nothingLabel={t("prune_modal.nothing_to_remove")} />
            )}
            {selection.volumes && (
              <ResourceSection title={t("prune_modal.volumes_label")} items={preview.volumes} nothingLabel={t("prune_modal.nothing_to_remove")} />
            )}
            {selection.networks && (
              <ResourceSection title={t("prune_modal.networks_label")} items={preview.networks} nothingLabel={t("prune_modal.nothing_to_remove")} />
            )}
          </div>
        )}

        {pruneError && (
          <Alert variant="danger" isInline title={pruneError} style={{ marginTop: "1rem" }} />
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="danger"
          onClick={() => void executePrune()}
          isLoading={pruning}
          isDisabled={pruning}
        >
          {t("prune_modal.prune_button")}
        </Button>
        <Button variant="secondary" onClick={() => setStep("select")} isDisabled={pruning}>
          ← {t("common.back")}
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pruning}>
          {t("common.cancel")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function ResourceSection({ title, items, nothingLabel }: { title: string; items: string[]; nothingLabel: string }) {
  return (
    <div>
      <strong>{title}</strong>
      {items.length === 0 ? (
        <p style={{ margin: "0.25rem 0 0 0", color: "var(--pf-t--global--text--color--subtle)" }}>
          {nothingLabel}
        </p>
      ) : (
        <ul style={{ margin: "0.25rem 0 0 1.25rem", padding: 0 }}>
          {items.map((item, i) => (
            <li key={i} style={{ marginBottom: "0.15rem" }}>
              <code>{item}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
