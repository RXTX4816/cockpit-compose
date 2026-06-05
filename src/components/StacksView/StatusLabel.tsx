import { useTranslation } from "react-i18next";
import { Label } from "@patternfly/react-core";
import type { StackStatus } from "../../api";

export function StatusLabel({ status }: { status: StackStatus }) {
  const { t } = useTranslation();
  const cfg: Record<StackStatus, { color: "green" | "grey" | "orange" | "blue"; textKey: string }> = {
    running: { color: "green", textKey: "stacks.status_running" },
    partial: { color: "orange", textKey: "stacks.status_partial" },
    stopped: { color: "grey", textKey: "stacks.status_stopped" },
    paused: { color: "blue", textKey: "stacks.status_paused" },
    unknown: { color: "grey", textKey: "stacks.status_unknown" },
  };
  const { color, textKey } = cfg[status];
  return <Label color={color} isCompact>{t(textKey)}</Label>;
}
