import { useState, useEffect } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Spinner,
  Alert,
  Label,
} from "@patternfly/react-core";
import {
  type ComposeStack,
  type ComposeContainer,
  listContainers,
  parseJsonOutput,
  parsePorts,
} from "../api";
import "./StackInfoModal.css";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function StackInfoModal({ stack, onClose }: Props) {
  const [containers, setContainers] = useState<ComposeContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const configFile = stack.ConfigFiles.split(",")[0].trim();
  useEffect(() => {
    let raw = "";
    const proc = listContainers(stack.Name);
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        setContainers(parseJsonOutput<ComposeContainer>(raw));
        setLoading(false);
      })
      .catch((ex: unknown) => {
        setError(ex instanceof Error ? ex.message : String(ex));
        setLoading(false);
      });
  }, [stack.Name]);

  return (
    <Modal isOpen onClose={onClose} variant="medium" aria-label={`Info — ${stack.Name}`}>
      <ModalHeader title={`${stack.Name} — info`} />
      <ModalBody>
        <section className="sim-section">
          <div className="sim-section-label">Compose file</div>
          <code className="sim-config-file">{configFile}</code>
        </section>

        <section>
          <div className="sim-section-label">Services</div>

          {loading ? (
            <Spinner size="md" />
          ) : error ? (
            <Alert variant="warning" isInline title="Could not load container info">{error}</Alert>
          ) : containers.length === 0 ? (
            <span className="sim-no-containers">No containers found.</span>
          ) : (
            <div className="sim-container-list">
              {containers.map(c => {
                const isRunning = c.State?.toLowerCase() === "running";
                const ports = parsePorts(c.Ports);
                return (
                  <div key={c.ID || c.Name} className="sim-container-card">
                    <div className="sim-card-header">
                      <Label color={isRunning ? "green" : "grey"} isCompact>{c.State || "unknown"}</Label>
                      <span className="sim-card-service">{c.Service || c.Name}</span>
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
                    </div>

                    {ports.length > 0 && (
                      <div className="sim-card-ports">
                        {ports.map(p => (
                          <Label
                            key={p}
                            isCompact
                            color="blue"
                            style={{ fontFamily: "var(--pf-t--global--font--family--mono)", fontSize: "0.72rem" }}
                          >
                            {p}
                          </Label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </ModalBody>
    </Modal>
  );
}
