import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Badge,
  NotificationDrawer,
  NotificationDrawerBody,
  NotificationDrawerHeader,
  NotificationDrawerList,
  NotificationDrawerListItem,
  NotificationDrawerListItemHeader,
  NotificationDrawerListItemBody,
  EmptyState,
  EmptyStateBody,
} from "@patternfly/react-core";
import { ListIcon } from "@patternfly/react-icons";
import { useBackgroundTasks, type BackgroundTask, type BackgroundTaskStatus } from "../hooks/useBackgroundTasks";
import { BackgroundTaskLogModal } from "./BackgroundTaskLogModal";
import "./BackgroundTasksDrawer.css";

function statusVariant(status: BackgroundTaskStatus): "success" | "danger" | "warning" | "info" | "custom" {
  switch (status) {
    case "success": return "success";
    case "error": return "danger";
    case "stopped": return "warning";
    default: return "info";
  }
}

export function BackgroundTasksDrawer() {
  const { t } = useTranslation();
  const { tasks, stop, remove } = useBackgroundTasks();
  const [open, setOpen] = useState(false);
  const [openTask, setOpenTask] = useState<BackgroundTask | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const activeCount = tasks.filter(t => t.status === "pending" || t.status === "running").length;
  // Reflects live status/lines of the task currently shown in the log modal, if still tracked.
  const liveOpenTask = openTask ? tasks.find(t => t.id === openTask.id) ?? openTask : null;

  // Newest task is last in the list (closest to the floating icon) — scroll it
  // into view and focus it whenever the panel opens or a new task arrives.
  useEffect(() => {
    if (!open || !bodyRef.current) return;
    const items = bodyRef.current.querySelectorAll("li");
    const last = items[items.length - 1] as HTMLElement | undefined;
    last?.scrollIntoView?.({ block: "nearest" });
    last?.focus();
  }, [open, tasks.length]);

  return (
    <>
      <Button
        variant="plain"
        className="btd-toggle"
        aria-label={t("background_tasks.toggle_button")}
        onClick={() => setOpen(o => !o)}
      >
        <ListIcon />
        {activeCount > 0 && <Badge className="btd-toggle-badge">{activeCount}</Badge>}
      </Button>

      {open && (
        <div className="btd-panel">
          <NotificationDrawer>
            <NotificationDrawerHeader
              title={t("background_tasks.title")}
              count={tasks.length}
              onClose={() => setOpen(false)}
            />
            <NotificationDrawerBody className="btd-body">
              <div ref={bodyRef} className="btd-body-inner">
              {tasks.length === 0 ? (
                <EmptyState titleText={t("background_tasks.empty_title")} headingLevel="h4">
                  <EmptyStateBody>{t("background_tasks.empty_body")}</EmptyStateBody>
                </EmptyState>
              ) : (
                <NotificationDrawerList>
                  {tasks.map(task => {
                    const clickable = task.status === "running" || task.status === "pending";
                    return (
                      <NotificationDrawerListItem
                        key={task.id}
                        variant={statusVariant(task.status)}
                        isHoverable={clickable}
                        onClick={clickable ? () => setOpenTask(task) : undefined}
                      >
                        <NotificationDrawerListItemHeader
                          variant={statusVariant(task.status)}
                          title={task.label}
                        />
                        <NotificationDrawerListItemBody>
                          <div className="btd-item-body">
                            <span className="btd-item-status">{t(`background_tasks.status_${task.status}`)}</span>
                            {task.errorMsg && <span className="btd-item-error">{task.errorMsg}</span>}
                            <div className="btd-item-actions">
                              {task.status === "running" && (
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); stop(task.id); }}
                                >
                                  {t("background_tasks.stop_button")}
                                </Button>
                              )}
                              {task.status !== "running" && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={(e) => { e.stopPropagation(); remove(task.id); }}
                                >
                                  {t("background_tasks.remove_button")}
                                </Button>
                              )}
                            </div>
                          </div>
                        </NotificationDrawerListItemBody>
                      </NotificationDrawerListItem>
                    );
                  })}
                </NotificationDrawerList>
              )}
              </div>
            </NotificationDrawerBody>
          </NotificationDrawer>
        </div>
      )}

      {liveOpenTask && <BackgroundTaskLogModal task={liveOpenTask} onClose={() => setOpenTask(null)} />}
    </>
  );
}
