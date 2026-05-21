import { Label } from "@patternfly/react-core";
import type { ComposeContainer } from "../../api";
import "./ContainerTable.css";

export function ContainerTable({ containers }: { containers: ComposeContainer[] }) {
  return (
    <div className="ct-list">
      {containers.map(c => {
        const isRunning = c.State?.toLowerCase() === "running";
        return (
          <div key={c.ID || c.Name} className="ct-row">
            <Label color={isRunning ? "green" : "grey"} isCompact>{c.State || "unknown"}</Label>
            <span className="ct-name">{c.Service || c.Name}</span>
            <span className="ct-image">{c.Image}</span>
            <span className="ct-uptime">{c.Status}</span>
          </div>
        );
      })}
    </div>
  );
}
