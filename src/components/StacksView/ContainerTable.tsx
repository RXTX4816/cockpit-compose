import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Label } from "@patternfly/react-core";
import { CheckCircleIcon, ExclamationTriangleIcon, ExternalLinkAltIcon, InProgressIcon } from "@patternfly/react-icons";
import type { ComposeContainer } from "../../api";
import { getImageChangelogUrl } from "../../lib/imageUrl";
import { ExternalLinkModal } from "../ExternalLinkModal";
import "./ContainerTable.css";

function HealthIcon({ health }: { health: string }) {
  const { t } = useTranslation();
  const h = health.toLowerCase();
  if (h === "healthy")
    return <CheckCircleIcon color="var(--pf-t--global--icon--color--status--success--default)" title={t("health.passing")} />;
  if (h === "unhealthy")
    return <ExclamationTriangleIcon color="var(--pf-t--global--icon--color--status--warning--default)" title={t("health.failing")} />;
  if (h === "starting")
    return <InProgressIcon color="var(--pf-t--global--icon--color--status--info--default)" title={t("health.starting")} />;
  return null;
}

export function ContainerTable({ containers }: { containers: ComposeContainer[] }) {
  const { t } = useTranslation();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const serviceNames = [...new Set(containers.map(c => c.Service || c.Name))];
  const groups = serviceNames.map(name => ({
    name,
    instances: containers.filter(c => (c.Service || c.Name) === name),
  }));

  return (
    <>
      {pendingUrl && <ExternalLinkModal url={pendingUrl} onClose={() => setPendingUrl(null)} />}
      <div className="ct-list">
        {groups.map(({ name, instances }) => {
          const runningCount = instances.filter(c => c.State?.toLowerCase() === "running").length;
          const anyUnhealthy = instances.some(c => c.Health?.toLowerCase() === "unhealthy");
          const anyStarting = !anyUnhealthy && instances.some(c => c.Health?.toLowerCase() === "starting");
          const anyHealthy = !anyUnhealthy && !anyStarting && instances.some(c => c.Health?.toLowerCase() === "healthy");
          const rep = instances[0];
          const imageUrl = rep ? getImageChangelogUrl(rep.Image) : null;
          const repState = rep?.State;

          return (
            <div key={name} className="ct-row">
              <Label color={runningCount > 0 ? "green" : "grey"} isCompact>
                {repState
                  ? t(`container_state.${repState.toLowerCase()}`, { defaultValue: repState })
                  : t("common.unknown")}
              </Label>
              <span className="ct-name">
                {imageUrl
                  ? (
                    <Button variant="link" isInline onClick={() => setPendingUrl(imageUrl)}>
                      {name}
                      {" "}
                      <ExternalLinkAltIcon />
                    </Button>
                  )
                  : name}
                {instances.length > 1 && (
                  <Badge isRead style={{ marginLeft: "0.35em" }}>
                    {t("container_table.replica_count", { count: instances.length })}
                  </Badge>
                )}
                {anyUnhealthy && <HealthIcon health="unhealthy" />}
                {anyStarting && <HealthIcon health="starting" />}
                {anyHealthy && <HealthIcon health="healthy" />}
              </span>
              <span className="ct-image">{rep?.Image}</span>
              <span className="ct-uptime">{rep?.Status}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
