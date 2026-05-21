import { useState, useCallback } from "react";
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

// Finds images belonging to the project's repos that no container (anywhere) currently uses.
// Strategy: get image refs from project containers → extract repos → list all versions of
// those repos → subtract any name that appears in a running-or-stopped container globally.
// Compares by image name (repo:tag) rather than ID so it works on all Docker/Podman versions.
async function findUnusedProjectImages(project: string): Promise<{ name: string; display: string }[]> {
  const imageRefs = await fetchLines(listProjectContainerImageRefs(project));
  if (imageRefs.length === 0) return [];

  // Strip tag/digest to get the repo name, deduplicate.
  const repos = [...new Set(imageRefs.map(ref => ref.split(":")[0]))];

  // Build a set of all image names currently in use by any container on the host.
  const usedNames = new Set(await fetchLines(listAllContainerImages()));

  const unused: { name: string; display: string }[] = [];
  for (const repo of repos) {
    const lines = await fetchLines(listImagesByRepo(repo));
    for (const line of lines) {
      const tab = line.indexOf("\t");
      if (tab === -1) continue;
      const name = line.slice(0, tab);       // "repo:tag"
      const size = line.slice(tab + 1);      // "248MB"
      if (!usedNames.has(name)) unused.push({ name, display: `${name} (${size})` });
    }
  }
  return unused;
}

export function PruneModal({ stack, onClose, onSuccess }: Props) {
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
      const [unusedImages, containers, volumes, networks] = await Promise.all([
        selection.images ? findUnusedProjectImages(stack.Name) : Promise.resolve([]),
        selection.containers ? fetchLines(listStoppedContainers(stack.Name)) : Promise.resolve([]),
        selection.volumes ? fetchLines(listDanglingVolumes(stack.Name)) : Promise.resolve([]),
        selection.networks ? fetchLines(listProjectNetworks(stack.Name)) : Promise.resolve([]),
      ]);
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
      <Modal isOpen variant="small" onClose={onClose} aria-label={`Prune resources — ${stack.Name}`}>
        <ModalHeader title={`Prune resources — ${stack.Name}`} />
        <ModalBody>
          {!isRunning && (
            <Alert variant="danger" isInline title="Stack is not running — risk of data loss" style={{ marginBottom: "1rem" }}>
              Resources that appear unused may still be needed to start this stack again.
              Volumes removed here cannot be recovered.
            </Alert>
          )}
          <Alert variant="warning" isInline title="Destructive action — cannot be undone" style={{ marginBottom: "1rem" }}>
            Pruning permanently deletes Docker resources. Volumes especially may contain
            persistent data that cannot be recovered. Review carefully before proceeding.
          </Alert>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Checkbox
              id="prune-images"
              label="Images"
              description="Older image versions for this stack's repos that are no longer used by any container."
              isChecked={selection.images}
              onChange={() => toggle("images")}
            />
            <Checkbox
              id="prune-containers"
              label="Containers"
              description="Stopped containers belonging to this stack."
              isChecked={selection.containers}
              onChange={() => toggle("containers")}
            />
            <Checkbox
              id="prune-volumes"
              label={<span>Volumes <span style={{ color: "var(--pf-t--global--color--status--danger--default)", fontSize: "0.8rem" }}>⚠ may contain persistent data</span></span>}
              description="Unused named volumes associated with this stack."
              isChecked={selection.volumes}
              onChange={() => toggle("volumes")}
            />
            <Checkbox
              id="prune-networks"
              label="Networks"
              description="Unused networks created for this stack (in-use ones are skipped)."
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
            Preview →
          </Button>
          <Button variant="link" onClick={onClose} isDisabled={loadingPreview}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>
    );
  }

  return (
    <Modal isOpen variant="medium" onClose={() => { if (!pruning) onClose(); }} aria-label={`Confirm prune — ${stack.Name}`}>
      <ModalHeader title={`Preview — resources to be removed`} />
      <ModalBody>
        {!isRunning && (
          <Alert
            variant="danger"
            isInline
            title="Stack is not running"
            style={{ marginBottom: "1rem" }}
          >
            Resources that appear unused may still be required to start the stack again.
            Volumes removed here cannot be recovered.
          </Alert>
        )}

        {loadingPreview ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
            <Spinner />
          </div>
        ) : preview && (
          <div style={{ fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {selection.images && (
              <ResourceSection title="Images" items={preview.images} />
            )}
            {selection.containers && (
              <ResourceSection title="Containers" items={preview.containers} />
            )}
            {selection.volumes && (
              <ResourceSection title="Volumes" items={preview.volumes} />
            )}
            {selection.networks && (
              <ResourceSection title="Networks" items={preview.networks} />
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
          Prune selected
        </Button>
        <Button variant="secondary" onClick={() => setStep("select")} isDisabled={pruning}>
          ← Back
        </Button>
        <Button variant="link" onClick={onClose} isDisabled={pruning}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function ResourceSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <strong>{title}</strong>
      {items.length === 0 ? (
        <p style={{ margin: "0.25rem 0 0 0", color: "var(--pf-t--global--text--color--subtle)" }}>
          Nothing to remove.
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
