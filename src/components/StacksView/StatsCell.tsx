import { Label, Spinner } from "@patternfly/react-core";
import type { StackStatus } from "../../api";
import { useContainerStats } from "../../hooks/useContainerStats";
import { formatBytes } from "../../lib/bytes";

interface StatsCellProps {
  stackName: string;
  status: StackStatus;
}

export function StatsCell({ stackName, status }: StatsCellProps) {
  const { ports, stats } = useContainerStats(stackName, status);

  if (status === "down" || status === "unknown") {
    return (
      <span style={{ color: "var(--pf-t--global--text--color--subtle)", fontSize: "var(--pf-t--global--font--size--sm)" }}>—</span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {ports.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
          {ports.map(p => (
            <Label
              key={p}
              isCompact
              color="blue"
              style={{ fontFamily: "var(--pf-t--global--font--family--mono)", fontSize: "0.7rem" }}
            >
              {p}
            </Label>
          ))}
        </div>
      )}
      {stats && (
        <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.75rem", color: "var(--pf-t--global--text--color--subtle)" }}>
          <span>CPU {stats.cpu.toFixed(1)}%</span>
          <span>Mem {formatBytes(stats.mem)}</span>
        </div>
      )}
      {ports.length === 0 && !stats && (
        <Spinner size="sm" />
      )}
    </div>
  );
}
