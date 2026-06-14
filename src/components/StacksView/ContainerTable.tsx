import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Label } from "@patternfly/react-core";
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

  return (
    <>
      {pendingUrl && <ExternalLinkModal url={pendingUrl} onClose={() => setPendingUrl(null)} />}
      <div className="ct-list">
        {containers.map(c => {
          const isRunning = c.State?.toLowerCase() === "running";
          const imageUrl = getImageChangelogUrl(c.Image);
          return (
            <div key={c.ID || c.Name} className="ct-row">
              <Label color={isRunning ? "green" : "grey"} isCompact>
                {c.State ? t(`container_state.${c.State.toLowerCase()}`, { defaultValue: c.State }) : t("common.unknown")}
              </Label>
              <span className="ct-name">
                {imageUrl
                  ? (
                    <Button variant="link" isInline onClick={() => setPendingUrl(imageUrl)}>
                      {c.Service || c.Name}
                      {" "}
                      <ExternalLinkAltIcon />
                    </Button>
                  )
                  : (c.Service || c.Name)}
                {c.Health && <HealthIcon health={c.Health} />}
              </span>
              <span className="ct-image">{c.Image}</span>
              <span className="ct-uptime">{c.Status}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
