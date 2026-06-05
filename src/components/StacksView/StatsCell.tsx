import type { ComponentType, CSSProperties } from "react";
import { useTranslation } from "react-i18next";
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

function PortBindIcon({ bindType }: { bindType: ParsedPort["bindType"] }) {
  const { t } = useTranslation();
  const cfg: Record<ParsedPort["bindType"], { Icon: ComponentType<{ color?: string; style?: CSSProperties }>; color: string; tooltipKey: string }> = {
    external: { Icon: GlobeIcon,   color: "currentColor", tooltipKey: "ports.external_tooltip" },
    localhost: { Icon: LaptopIcon, color: "currentColor", tooltipKey: "ports.localhost_tooltip" },
    specific:  { Icon: NetworkIcon, color: "currentColor", tooltipKey: "ports.specific_tooltip" },
  };
  const { Icon, color, tooltipKey } = cfg[bindType];
  return (
    <Tooltip content={t(tooltipKey)}>
      <Icon color={color} style={{ marginRight: "0.2rem", verticalAlign: "middle" }} />
    </Tooltip>
  );
}

export function StatsCell({ stackName, status }: StatsCellProps) {
  const { t } = useTranslation();
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
          <span>{t("stats.cpu")} {stats.cpu.toFixed(1)}%</span>
          <span>{t("stats.mem")} {formatBytes(stats.mem)}</span>
        </div>
      )}
      {ports.length === 0 && !stats && (
        <Spinner size="sm" />
      )}
    </div>
  );
}
