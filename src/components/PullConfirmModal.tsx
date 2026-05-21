import { useEffect, useState } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Alert,
} from "@patternfly/react-core";
import { load as loadYaml } from "js-yaml";
import { type ComposeStack, readComposeFile } from "../api";

interface ImageEntry {
  service: string;
  image: string;
  risky: boolean;
}

function parseImages(yaml: string): ImageEntry[] {
  try {
    const doc = loadYaml(yaml) as Record<string, unknown>;
    const services = doc?.services as Record<string, { image?: string; build?: unknown }> | undefined;
    if (!services) return [];
    return Object.entries(services)
      .filter(([, svc]) => svc?.image && !svc?.build)
      .map(([name, svc]) => {
        const image = svc.image!;
        const tag = image.includes(":") ? image.split(":").pop()! : "latest";
        const risky = tag === "latest" || tag === "";
        return { service: name, image, risky };
      });
  } catch {
    return [];
  }
}

interface Props {
  stack: ComposeStack;
  onConfirm: () => void;
  onClose: () => void;
}

export function PullConfirmModal({ stack, onConfirm, onClose }: Props) {
  const configFile = stack.ConfigFiles.split(",")[0].trim();
  const [images, setImages] = useState<ImageEntry[]>([]);

  useEffect(() => {
    let content = "";
    const proc = readComposeFile(configFile);
    proc.stream((data: string) => { content += data; });
    void proc.then(() => setImages(parseImages(content)));
  }, [configFile]);

  const riskyImages = images.filter(i => i.risky);
  const hasRisky = riskyImages.length > 0;

  return (
    <Modal isOpen onClose={onClose} variant="small" aria-label={`Confirm pull — ${stack.Name}`}>
      <ModalHeader title={`Pull latest images — ${stack.Name}`} />
      <ModalBody>
        <Alert
          variant="warning"
          isInline
          title="Newer image versions may introduce breaking changes"
          style={{ marginBottom: "1rem" }}
        >
          Review changelogs before pulling, especially if services use{" "}
          <code>:latest</code> or an untagged image. Pinning to a specific
          version tag avoids unexpected updates.
        </Alert>

        {images.length > 0 && (
          <div style={{ fontSize: "0.875rem" }}>
            <strong>Images to be updated:</strong>
            <ul style={{ margin: "0.5rem 0 0 1.25rem", padding: 0 }}>
              {images.map(({ service, image, risky }) => (
                <li key={service} style={{ marginBottom: "0.25rem" }}>
                  <code>{service}</code>
                  {" — "}
                  <code>{image}</code>
                  {risky && (
                    <span style={{ marginLeft: "0.4rem", color: "var(--pf-t--global--color--status--warning--default)" }}>
                      ⚠ unpinned
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {hasRisky && (
              <p style={{ marginTop: "0.75rem", color: "var(--pf-t--global--text--color--subtle)", fontSize: "0.8rem" }}>
                Unpinned images always pull whatever the registry considers
                &quot;latest&quot; and are most likely to change behaviour between pulls.
              </p>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={onConfirm}>Pull</Button>
        <Button variant="link" onClick={onClose}>Cancel</Button>
      </ModalFooter>
    </Modal>
  );
}
