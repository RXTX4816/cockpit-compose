import { useState, useEffect, type CSSProperties } from "react";
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

  const sectionLabel: CSSProperties = {
    fontWeight: 600,
    fontSize: "var(--pf-t--global--font--size--sm)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--pf-t--global--text--color--subtle)",
    marginBottom: "0.5rem",
  };

  return (
    <Modal isOpen onClose={onClose} variant="medium" aria-label={`Info — ${stack.Name}`}>
      <ModalHeader title={`${stack.Name} — info`} />
      <ModalBody>
        <section style={{ marginBottom: "1.5rem" }}>
          <div style={sectionLabel}>Compose file</div>
          <code style={{ fontSize: "var(--pf-t--global--font--size--sm)", wordBreak: "break-all" }}>
            {configFile}
          </code>
        </section>

        <section>
          <div style={sectionLabel}>Services</div>

          {loading ? (
            <Spinner size="md" />
          ) : error ? (
            <Alert variant="warning" isInline title="Could not load container info">{error}</Alert>
          ) : containers.length === 0 ? (
            <span style={{ color: "var(--pf-t--global--text--color--subtle)", fontSize: "var(--pf-t--global--font--size--sm)" }}>
              No containers found.
            </span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {containers.map(c => {
                const isRunning = c.State?.toLowerCase() === "running";
                const ports = parsePorts(c.Ports);
                return (
                  <div
                    key={c.ID || c.Name}
                    style={{
                      padding: "0.75rem 1rem",
                      background: "var(--pf-t--global--background--color--secondary--default)",
                      borderRadius: "var(--pf-t--global--border--radius--200)",
                      border: "1px solid var(--pf-t--global--border--color--default)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                      <Label color={isRunning ? "green" : "grey"} isCompact>{c.State || "unknown"}</Label>
                      <span style={{ fontWeight: 600 }}>{c.Service || c.Name}</span>
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "6rem 1fr",
                      gap: "0.2rem 0.5rem",
                      fontSize: "var(--pf-t--global--font--size--sm)",
                      color: "var(--pf-t--global--text--color--subtle)",
                    }}>
                      <span>Image</span>
                      <code style={{ wordBreak: "break-all", color: "inherit" }}>{c.Image || "—"}</code>

                      {c.ID && (
                        <>
                          <span>Container ID</span>
                          <code style={{ color: "inherit" }}>{c.ID.slice(0, 12)}</code>
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
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.6rem" }}>
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
