import { Label } from "@patternfly/react-core";
import type { StackStatus } from "../../api";

export function StatusLabel({ status }: { status: StackStatus }) {
  const cfg: Record<StackStatus, { color: "green" | "grey" | "orange"; text: string }> = {
    running: { color: "green", text: "running" },
    partial: { color: "orange", text: "partial" },
    down: { color: "grey", text: "stopped" },
    unknown: { color: "grey", text: "unknown" },
  };
  const { color, text } = cfg[status];
  return <Label color={color} isCompact>{text}</Label>;
}
