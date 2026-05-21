import { Label, Spinner } from "@patternfly/react-core";
import type { StackStatus } from "../../api";
import { formatBytes } from "../../api";
import { useContainerStats } from "../../hooks/useContainerStats";
import "./StatsCell.css";

interface StatsCellProps {
  stackName: string;
  status: StackStatus;
}

export function StatsCell({ stackName, status }: StatsCellProps) {
  const { ports, stats } = useContainerStats(stackName, status);

  if (status === "down" || status === "unknown") {
    return <span className="sc-empty">—</span>;
  }

  return (
    <div className="sc-cell">
      {ports.length > 0 && (
        <div className="sc-ports">
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
        <div className="sc-metrics">
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
