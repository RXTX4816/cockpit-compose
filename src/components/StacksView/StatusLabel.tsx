import { useTranslation } from "react-i18next";
import { StatusBadge } from "@rxtx4816/cockpit-plugin-base-react/components";
import type { StackStatus } from "../../api";

export function StatusLabel({ status }: { status: StackStatus }) {
  const { t } = useTranslation();

  const config: Record<StackStatus, { color: "green" | "grey" | "orange" | "blue"; label: string }> = {
    running: { color: "green", label: t("stacks.status_running") },
    partial: { color: "orange", label: t("stacks.status_partial") },
    stopped: { color: "grey", label: t("stacks.status_stopped") },
    paused: { color: "blue", label: t("stacks.status_paused") },
    unknown: { color: "grey", label: t("stacks.status_unknown") },
  };

  return <StatusBadge status={status} config={config} isCompact />;
}
