import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Label, Spinner } from "@patternfly/react-core";
import { Tooltip } from "@rxtx4816/cockpit-plugin-base-react/components";
import { CheckCircleIcon, ExclamationTriangleIcon, InProgressIcon, BanIcon, PlayIcon, RedoAltIcon, ListAltIcon } from "@patternfly/react-icons";
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

export interface ServiceActions {
  actingService: string | null;
  onStart: (service: string) => void;
  onStop: (service: string) => void;
  onRestart: (service: string) => void;
  onLogs: (service: string) => void;
}

export function ContainerTable({
  containers,
  actions,
}: {
  containers: ComposeContainer[];
  actions?: ServiceActions;
}) {
  const { t } = useTranslation();
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const serviceNames = [...new Set(containers.map(c => c.Service || c.Name))];
  const groups = serviceNames.map(name => ({
    name,
    instances: containers.filter(c => (c.Service || c.Name) === name),
  }));

  return (
    <>
      {pendingUrl && (
        <ExternalLinkModal
          url={pendingUrl}
          onClose={() => setPendingUrl(null)}
          labels={{
            title: t("external_link_modal.title"),
            ariaLabel: t("external_link_modal.aria_label"),
            warningTitle: t("external_link_modal.warning_title"),
            continueButton: t("common.continue"),
            cancelButton: t("common.cancel"),
          }}
        />
      )}
      <div className="ct-list">
        <div className="ct-header">
          <span>{t("container_table.col_status")}</span>
          <span>{t("container_table.col_service")}</span>
          <span>{t("container_table.col_image")}</span>
          <span>{t("container_table.col_uptime")}</span>
          {actions && <span />}
        </div>
        {groups.map(({ name, instances }) => {
          const runningCount = instances.filter(c => c.State?.toLowerCase() === "running").length;
          const anyUnhealthy = instances.some(c => c.Health?.toLowerCase() === "unhealthy");
          const anyStarting = !anyUnhealthy && instances.some(c => c.Health?.toLowerCase() === "starting");
          const anyHealthy = !anyUnhealthy && !anyStarting && instances.some(c => c.Health?.toLowerCase() === "healthy");
          const rep = instances[0];
          const imageUrl = rep ? getImageChangelogUrl(rep.Image) : null;
          const repState = rep?.State;
          const isRunning = runningCount > 0;
          const isActing = actions?.actingService === name;

          return (
            <div key={name} className="ct-row">
              <Label color={isRunning ? "green" : "grey"} isCompact>
                {repState
                  ? t(`container_state.${repState.toLowerCase()}`, { defaultValue: repState })
                  : t("common.unknown")}
              </Label>
              <span className="ct-name">
                {imageUrl
                  ? (
                    <Button variant="link" isInline onClick={() => setPendingUrl(imageUrl)}>
                      {name}
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
              {actions && (
                <span className="ct-actions">
                  {isActing
                    ? <Spinner size="sm" />
                    : (
                      <>
                        {isRunning
                          ? (
                            <Tooltip content={t("service_actions.stop")}>
                              <Button variant="plain" size="sm" aria-label={t("service_actions.stop")} onClick={() => actions.onStop(name)}>
                                <BanIcon />
                              </Button>
                            </Tooltip>
                          )
                          : (
                            <Tooltip content={t("service_actions.start")}>
                              <Button variant="plain" size="sm" aria-label={t("service_actions.start")} onClick={() => actions.onStart(name)}>
                                <PlayIcon />
                              </Button>
                            </Tooltip>
                          )}
                        <Tooltip content={t("service_actions.restart")}>
                          <Button variant="plain" size="sm" aria-label={t("service_actions.restart")} onClick={() => actions.onRestart(name)}>
                            <RedoAltIcon />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t("service_actions.logs")}>
                          <Button variant="plain" size="sm" aria-label={t("service_actions.logs")} onClick={() => actions.onLogs(name)}>
                            <ListAltIcon />
                          </Button>
                        </Tooltip>
                      </>
                    )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
