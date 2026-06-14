import { useState, useEffect, type ComponentType, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
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
  type SharedNetwork,
  type ParsedPort,
  listContainers,
  listImages,
  listVolumes,
  listProjectNetworks,
  listNetworkConnectedProjects,
  readComposeFile,
  getServiceProfileMapFromCompose,
  parseJsonOutput,
  parsePortsDetailed,
  formatBytes,
  getPortUrl,
} from "../api";
import "./StackInfoModal.css";
import { splitConfigFiles } from "../lib/configFiles";

const MODAL_BIND_ICONS: Record<ParsedPort["bindType"], { Icon: ComponentType<{ color?: string; style?: CSSProperties }>; color: string }> = {
  external: { Icon: GlobeIcon,   color: "currentColor" },
  localhost: { Icon: LaptopIcon, color: "currentColor" },
  specific:  { Icon: NetworkIcon, color: "currentColor" },
};

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function StackInfoModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
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

  const [networks, setNetworks] = useState<SharedNetwork[]>([]);
  const [loadingNetworks, setLoadingNetworks] = useState(true);
  const [networkError, setNetworkError] = useState<string | null>(null);

  const [serviceProfileMap, setServiceProfileMap] = useState<Record<string, string[]>>({});

  const configFiles = splitConfigFiles(stack.ConfigFiles);
  const configFile = configFiles[0];

  useEffect(() => {
    let content = "";
    const proc = readComposeFile(configFile);
    proc.stream((d: string) => { content += d; });
    void proc.then(() => setServiceProfileMap(getServiceProfileMapFromCompose(content)));
  }, [configFile]);

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
    const proc = listImages(stack.Name, splitConfigFiles(stack.ConfigFiles));
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
  }, [stack.Name, stack.ConfigFiles]);

  useEffect(() => {
    let raw = "";
    const proc = listVolumes(stack.Name, splitConfigFiles(stack.ConfigFiles));
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
  }, [stack.Name, stack.ConfigFiles]);

  useEffect(() => {
    let cancelled = false;

    async function loadNetworks() {
      try {
        let raw = "";
        const proc = listProjectNetworks(stack.Name);
        proc.stream(d => { raw += d; });
        await proc;
        const networkNames = raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);

        const results: SharedNetwork[] = await Promise.all(
          networkNames.map(async (name): Promise<SharedNetwork> => {
            const projectRaw = await listNetworkConnectedProjects(name);
            const sharedWith = [...new Set(
              projectRaw.split("\n").map(l => l.trim()).filter(l => l.length > 0 && l !== stack.Name)
            )];
            return { name, sharedWith };
          })
        );
        if (!cancelled) {
          setNetworks(results);
          setLoadingNetworks(false);
        }
      } catch (ex: unknown) {
        if (!cancelled) {
          setNetworkError(ex instanceof Error ? ex.message : String(ex));
          setLoadingNetworks(false);
        }
      }
    }

    void loadNetworks();
    return () => { cancelled = true; };
  }, [stack.Name]);

  return (
    <Modal isOpen onClose={onClose} variant="medium" aria-label={t("info_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("info_modal.title", { name: stack.Name })} />
      <ModalBody>
        <section className="sim-section">
          <div className="sim-section-label">{t("info_modal.section_compose_file")}</div>
          <code className="sim-config-file">{configFile}</code>
        </section>

        <section className="sim-section">
          <div className="sim-section-label">{t("info_modal.section_services")}</div>

          {loadingContainers ? (
            <Spinner size="md" />
          ) : containerError ? (
            <Alert variant="warning" isInline title={t("info_modal.container_error_title")}>{containerError}</Alert>
          ) : containers.length === 0 ? (
            <span className="sim-no-containers">{t("info_modal.no_containers")}</span>
          ) : (
            <div className="sim-container-list">
              {containers.map(c => {
                const isRunning = c.State?.toLowerCase() === "running";
                const health = c.Health?.toLowerCase();
                const ports = parsePortsDetailed(c.Ports);
                return (
                  <div key={c.ID || c.Name} className="sim-container-card">
                    <div className="sim-card-header">
                      <Label color={isRunning ? "green" : "grey"} isCompact>{c.State || t("common.unknown")}</Label>
                      <span className="sim-card-service">{c.Service || c.Name}</span>
                      {health === "healthy" && (
                        <CheckCircleIcon
                          color="var(--pf-t--global--icon--color--status--success--default)"
                          title={t("health.passing")}
                        />
                      )}
                      {health === "unhealthy" && (
                        <ExclamationTriangleIcon
                          color="var(--pf-t--global--icon--color--status--warning--default)"
                          title={t("health.failing")}
                        />
                      )}
                      {health === "starting" && (
                        <InProgressIcon
                          color="var(--pf-t--global--icon--color--status--info--default)"
                          title={t("health.starting")}
                        />
                      )}
                    </div>

                    <div className="sim-card-grid">
                      <span>{t("info_modal.img_col_service")}</span>
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

                      {(serviceProfileMap[c.Service ?? ""] ?? []).length > 0 && (
                        <>
                          <span>{t("info_modal.profiles_label")}</span>
                          <span style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                            {(serviceProfileMap[c.Service ?? ""] ?? []).map(p => (
                              <Label key={p} isCompact color="purple">{p}</Label>
                            ))}
                          </span>
                        </>
                      )}
                    </div>

                    {ports.length > 0 && (
                      <div className="sim-card-ports">
                        {ports.map(p => {
                          const { Icon, color } = MODAL_BIND_ICONS[p.bindType];
                          const url = getPortUrl(p);
                          return (
                            <Label
                              key={p.fullLabel}
                              isCompact
                              color="blue"
                              style={{ fontFamily: "var(--pf-t--global--font--family--mono)", fontSize: "0.72rem", ...(url ? { cursor: "pointer" } : {}) }}
                              onClick={url ? () => window.open(url, "_blank", "noopener,noreferrer") : undefined}
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
          <div className="sim-section-label">{t("info_modal.section_images")}</div>

          {loadingImages ? (
            <Spinner size="md" />
          ) : imageError ? (
            <Alert variant="warning" isInline title={t("info_modal.image_error_title")}>{imageError}</Alert>
          ) : images.length === 0 ? (
            <span className="sim-no-containers">{t("info_modal.no_images")}</span>
          ) : (
            <table className="sim-table">
              <thead>
                <tr>
                  <th>{t("info_modal.img_col_service")}</th>
                  <th>{t("info_modal.img_col_repo")}</th>
                  <th>{t("info_modal.img_col_tag")}</th>
                  <th>{t("info_modal.img_col_size")}</th>
                  <th>{t("info_modal.img_col_created")}</th>
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
          <div className="sim-section-label">{t("info_modal.section_volumes")}</div>

          {loadingVolumes ? (
            <Spinner size="md" />
          ) : volumesUnavailable ? (
            <span className="sim-no-containers">{t("info_modal.volumes_unavailable")}</span>
          ) : volumeError ? (
            <Alert variant="warning" isInline title={t("info_modal.volume_error_title")}>{volumeError}</Alert>
          ) : volumes.length === 0 ? (
            <span className="sim-no-containers">{t("info_modal.no_volumes")}</span>
          ) : (
            <table className="sim-table">
              <thead>
                <tr>
                  <th>{t("info_modal.vol_col_name")}</th>
                  <th>{t("info_modal.vol_col_driver")}</th>
                  <th>{t("info_modal.vol_col_mountpoint")}</th>
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

        <section className="sim-section">
          <div className="sim-section-label">{t("info_modal.section_networks")}</div>

          {loadingNetworks ? (
            <Spinner size="md" />
          ) : networkError ? (
            <Alert variant="warning" isInline title={t("info_modal.network_error_title")}>{networkError}</Alert>
          ) : networks.length === 0 ? (
            <span className="sim-no-containers">{t("info_modal.no_networks")}</span>
          ) : (
            <table className="sim-table">
              <thead>
                <tr>
                  <th>{t("info_modal.net_col_name")}</th>
                  <th>{t("info_modal.net_col_shared")}</th>
                </tr>
              </thead>
              <tbody>
                {networks.map((net, i) => (
                  <tr key={net.name || i}>
                    <td><code>{net.name}</code></td>
                    <td>
                      {net.sharedWith.length > 0 ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <ExclamationTriangleIcon
                            color="var(--pf-t--global--icon--color--status--warning--default)"
                            title={t("info_modal.net_shared_icon_title")}
                          />
                          {net.sharedWith.join(", ")}
                        </span>
                      ) : (
                        <span style={{ color: "var(--pf-t--global--text--color--subtle)" }}>—</span>
                      )}
                    </td>
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
