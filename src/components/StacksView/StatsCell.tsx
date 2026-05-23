import type { ComponentType, CSSProperties } from "react";
import { Label, Spinner, Tooltip } from "@patternfly/react-core";
import { GlobeIcon, LaptopIcon, NetworkIcon } from "@patternfly/react-icons";
import type { ParsedPort, StackStatus } from "../../api";
import { formatBytes } from "../../api";
import { useContainerStats } from "../../hooks/useContainerStats";
import "./StatsCell.css";

interface StatsCellProps {
  stackName: string;
  status: StackStatus;
}

const BIND_ICON_CONFIG: Record<ParsedPort["bindType"], { Icon: ComponentType<{ color?: string; style?: CSSProperties }>; color: string; tooltip: string }> = {
  external: { Icon: GlobeIcon,   color: "currentColor", tooltip: "Exposed on all interfaces — open stack info for full details" },
  localhost: { Icon: LaptopIcon, color: "currentColor", tooltip: "Bound to localhost only — open stack info for full details" },
  specific:  { Icon: NetworkIcon, color: "currentColor", tooltip: "Bound to a specific IP — open stack info for full details" },
};

function PortBindIcon({ bindType }: { bindType: ParsedPort["bindType"] }) {
  const { Icon, color, tooltip } = BIND_ICON_CONFIG[bindType];
  return (
    <Tooltip content={tooltip}>
      <Icon color={color} style={{ marginRight: "0.2rem", verticalAlign: "middle" }} />
    </Tooltip>
  );
}

export function StatsCell({ stackName, status }: StatsCellProps) {
  const { ports, stats } = useContainerStats(stackName, status);

  if (status === "stopped" || status === "unknown") {
    return <span className="sc-empty">—</span>;
  }

  return (
    <div className="sc-cell">
      {ports.length > 0 && (
        <div className="sc-ports">
          {ports.map(p => (
            <Label
              key={p.label}
              isCompact
              color="blue"
              style={{ fontFamily: "var(--pf-t--global--font--family--mono)", fontSize: "0.7rem" }}
            >
              <PortBindIcon bindType={p.bindType} />
              {p.label}
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
