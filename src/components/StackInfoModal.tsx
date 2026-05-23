import { useState, useEffect, type ComponentType, type CSSProperties } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Spinner,
  Alert,
  Label,
} from "@patternfly/react-core";
import { CheckCircleIcon, ExclamationTriangleIcon, GlobeIcon, InProgressIcon, LaptopIcon, NetworkIcon } from "@patternfly/react-icons";
import {
  type ComposeStack,
  type ComposeContainer,
  type ComposeImage,
  type ComposeVolume,
  type ParsedPort,
  listContainers,
  listImages,
  listVolumes,
  parseJsonOutput,
  parsePortsDetailed,
  formatBytes,
} from "../api";
import "./StackInfoModal.css";

const MODAL_BIND_ICONS: Record<ParsedPort["bindType"], { Icon: ComponentType<{ color?: string; style?: CSSProperties }>; color: string; label: string }> = {
  external: { Icon: GlobeIcon,   color: "currentColor", label: "all interfaces" },
  localhost: { Icon: LaptopIcon, color: "currentColor", label: "localhost" },
  specific:  { Icon: NetworkIcon, color: "currentColor", label: "specific IP" },
};

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function StackInfoModal({ stack, onClose }: Props) {
  const [containers, setContainers] = useState<ComposeContainer[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(true);
  const [containerError, setContainerError] = useState<string | null>(null);

  const [images, setImages] = useState<ComposeImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(true);
  const [imageError, setImageError] = useState<string | null>(null);

  const [volumes, setVolumes] = useState<ComposeVolume[]>([]);
  const [loadingVolumes, setLoadingVolumes] = useState(true);
  const [volumeError, setVolumeError] = useState<string | null>(null);
  const [volumesUnavailable, setVolumesUnavailable] = useState(false);

  const configFile = stack.ConfigFiles.split(",")[0].trim();

  useEffect(() => {
    let raw = "";
    const proc = listContainers(stack.Name);
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        setContainers(parseJsonOutput<ComposeContainer>(raw));
        setLoadingContainers(false);
      })
      .catch((ex: unknown) => {
        setContainerError(ex instanceof Error ? ex.message : String(ex));
        setLoadingContainers(false);
      });
  }, [stack.Name]);

  useEffect(() => {
    let raw = "";
    const proc = listImages(stack.Name, configFile);
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        setImages(parseJsonOutput<ComposeImage>(raw));
        setLoadingImages(false);
      })
      .catch((ex: unknown) => {
        setImageError(ex instanceof Error ? ex.message : String(ex));
        setLoadingImages(false);
      });
  }, [stack.Name, configFile]);

  useEffect(() => {
    let raw = "";
    const proc = listVolumes(stack.Name, configFile);
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        setVolumes(parseJsonOutput<ComposeVolume>(raw));
        setLoadingVolumes(false);
      })
      .catch((ex: unknown) => {
        const msg = ex instanceof Error ? ex.message : String(ex);
        // docker compose volumes is not available on all Docker versions
        if (msg.includes("unknown command") || msg.includes("unknown flag") || msg.includes("Usage:")) {
          setVolumesUnavailable(true);
        } else {
          setVolumeError(msg);
        }
        setLoadingVolumes(false);
      });
  }, [stack.Name, configFile]);

  return (
    <Modal isOpen onClose={onClose} variant="medium" aria-label={`Info — ${stack.Name}`}>
      <ModalHeader title={`${stack.Name} — info`} />
      <ModalBody>
        <section className="sim-section">
          <div className="sim-section-label">Compose file</div>
          <code className="sim-config-file">{configFile}</code>
        </section>

        <section className="sim-section">
          <div className="sim-section-label">Services</div>

          {loadingContainers ? (
            <Spinner size="md" />
          ) : containerError ? (
            <Alert variant="warning" isInline title="Could not load container info">{containerError}</Alert>
          ) : containers.length === 0 ? (
            <span className="sim-no-containers">No containers found.</span>
          ) : (
            <div className="sim-container-list">
              {containers.map(c => {
                const isRunning = c.State?.toLowerCase() === "running";
                const health = c.Health?.toLowerCase();
                const ports = parsePortsDetailed(c.Ports);
                return (
                  <div key={c.ID || c.Name} className="sim-container-card">
                    <div className="sim-card-header">
                      <Label color={isRunning ? "green" : "grey"} isCompact>{c.State || "unknown"}</Label>
                      <span className="sim-card-service">{c.Service || c.Name}</span>
                      {health === "healthy" && (
                        <CheckCircleIcon
                          color="var(--pf-t--global--icon--color--status--success--default)"
                          title="Health check passing"
                        />
                      )}
                      {health === "unhealthy" && (
                        <ExclamationTriangleIcon
                          color="var(--pf-t--global--icon--color--status--warning--default)"
                          title="Health check failing"
                        />
                      )}
                      {health === "starting" && (
                        <InProgressIcon
                          color="var(--pf-t--global--icon--color--status--info--default)"
                          title="Health check starting"
                        />
                      )}
                    </div>

                    <div className="sim-card-grid">
                      <span>Image</span>
                      <code className="sim-card-code">{c.Image || "—"}</code>

                      {c.ID && (
                        <>
                          <span>Container ID</span>
                          <code className="sim-card-code">{c.ID.slice(0, 12)}</code>
                        </>
                      )}

                      {c.Status && (
                        <>
                          <span>Uptime</span>
                          <span>{c.Status}</span>
                        </>
                      )}

                      {health && (
                        <>
                          <span>Health</span>
                          <span>{c.Health}</span>
                        </>
                      )}
                    </div>

                    {ports.length > 0 && (
                      <div className="sim-card-ports">
                        {ports.map(p => {
                          const { Icon, color } = MODAL_BIND_ICONS[p.bindType];
                          return (
                            <Label
                              key={p.fullLabel}
                              isCompact
                              color="blue"
                              style={{ fontFamily: "var(--pf-t--global--font--family--mono)", fontSize: "0.72rem" }}
                            >
                              <Icon color={color} style={{ marginRight: "0.2rem", verticalAlign: "middle" }} />
                              {p.fullLabel}
                            </Label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="sim-section">
          <div className="sim-section-label">Images</div>

          {loadingImages ? (
            <Spinner size="md" />
          ) : imageError ? (
            <Alert variant="warning" isInline title="Could not load images">{imageError}</Alert>
          ) : images.length === 0 ? (
            <span className="sim-no-containers">No images found.</span>
          ) : (
            <table className="sim-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Repository</th>
                  <th>Tag</th>
                  <th>Size</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {images.map((img, i) => (
                  <tr key={img.ID || i}>
                    <td>{img.ContainerName || "—"}</td>
                    <td><code>{img.Repository || "—"}</code></td>
                    <td><code>{img.Tag || "—"}</code></td>
                    <td>{img.Size != null ? formatBytes(Number(img.Size)) : "—"}</td>
                    <td>{img.CreatedAt || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="sim-section">
          <div className="sim-section-label">Volumes</div>

          {loadingVolumes ? (
            <Spinner size="md" />
          ) : volumesUnavailable ? (
            <span className="sim-no-containers">Not available on this Docker Compose version.</span>
          ) : volumeError ? (
            <Alert variant="warning" isInline title="Could not load volumes">{volumeError}</Alert>
          ) : volumes.length === 0 ? (
            <span className="sim-no-containers">No volumes found.</span>
          ) : (
            <table className="sim-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Driver</th>
                  <th>Mountpoint</th>
                </tr>
              </thead>
              <tbody>
                {volumes.map((vol, i) => (
                  <tr key={vol.Name || i}>
                    <td><code>{vol.Name || "—"}</code></td>
                    <td>{vol.Driver || "—"}</td>
                    <td><code className="sim-mountpoint">{vol.Mountpoint || "—"}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </ModalBody>
    </Modal>
  );
}
