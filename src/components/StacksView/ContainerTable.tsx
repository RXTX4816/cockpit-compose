import { Label } from "@patternfly/react-core";
import { ExclamationTriangleIcon, InProgressIcon } from "@patternfly/react-icons";
import type { ComposeContainer } from "../../api";
import "./ContainerTable.css";

function HealthIcon({ health }: { health: string }) {
  const h = health?.toLowerCase();
  if (h === "unhealthy")
    return <ExclamationTriangleIcon color="var(--pf-t--global--icon--color--status--warning--default)" title="Health check failing" />;
  if (h === "starting")
    return <InProgressIcon color="var(--pf-t--global--icon--color--status--info--default)" title="Health check starting" />;
  return null;
}

export function ContainerTable({ containers }: { containers: ComposeContainer[] }) {
  return (
    <div className="ct-list">
      {containers.map(c => {
        const isRunning = c.State?.toLowerCase() === "running";
        return (
          <div key={c.ID || c.Name} className="ct-row">
            <Label color={isRunning ? "green" : "grey"} isCompact>{c.State || "unknown"}</Label>
            <span className="ct-name">
              {c.Service || c.Name}
              {c.Health && <HealthIcon health={c.Health} />}
            </span>
            <span className="ct-image">{c.Image}</span>
            <span className="ct-uptime">{c.Status}</span>
          </div>
        );
      })}
    </div>
  );
}
