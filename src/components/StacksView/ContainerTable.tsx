import { Label } from "@patternfly/react-core";
import type { ComposeContainer } from "../../api";

export function ContainerTable({ containers }: { containers: ComposeContainer[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {containers.map(c => {
        const isRunning = c.State?.toLowerCase() === "running";
        return (
          <div
            key={c.ID || c.Name}
            style={{
              display: "grid",
              gridTemplateColumns: "7rem 10rem 1fr auto",
              gap: "0.75rem",
              alignItems: "center",
              padding: "0.35rem 0",
              borderTop: "1px solid var(--pf-t--global--border--color--default)",
              fontSize: "var(--pf-t--global--font--size--sm)",
            }}
          >
            <Label color={isRunning ? "green" : "grey"} isCompact>{c.State || "unknown"}</Label>
            <span style={{ fontWeight: 500 }}>{c.Service || c.Name}</span>
            <span style={{ color: "var(--pf-t--global--text--color--subtle)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.Image}
            </span>
            <span style={{ color: "var(--pf-t--global--text--color--subtle)", textAlign: "right", whiteSpace: "nowrap" }}>
              {c.Status}
            </span>
          </div>
        );
      })}
    </div>
  );
}
