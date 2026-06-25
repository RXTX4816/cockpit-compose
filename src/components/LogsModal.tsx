import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Spinner,
} from "@patternfly/react-core";
import { LogViewer, Tooltip } from "@rxtx4816/cockpit-plugin-base-react/components";
import { TimesIcon, ClockIcon } from "@patternfly/react-icons";
import { type ComposeStack, readComposeFile, getServicesFromCompose } from "../api";
import { parseLine } from "../lib/logParser";
import { useLogStream, LOG_MAX_LINES } from "../hooks/useLogStream";
import "./LogsModal.css";
import { splitConfigFiles } from "../lib/configFiles";

type LevelFilter = "all" | "error" | "warn" | "info";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
  initialService?: string;
}

export function LogsModal({ stack, onClose, initialService }: Props) {
  const { t } = useTranslation();
  const [selectedService, setSelectedService] = useState(initialService ?? "");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [services, setServices] = useState<string[]>([]);

  const configFiles = useMemo(() => splitConfigFiles(stack.ConfigFiles), [stack.ConfigFiles]);

  useEffect(() => {
    let raw = "";
    const proc = readComposeFile(configFiles[0] ?? "");
    proc.stream(d => { raw += d; });
    proc.then(() => setServices(getServicesFromCompose(raw))).catch(() => {});
  }, [configFiles]);

  const { lines, streaming, paused, pause, resume, restart, clear } = useLogStream(
    stack.Name,
    configFiles,
    selectedService || undefined,
    services,
  );

  const parsedLines = useMemo(() => {
    const parsed = lines.map(parseLine);
    parsed.sort((a, b) => {
      const ta = a.raw.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/)?.[0] ?? "";
      const tb = b.raw.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/)?.[0] ?? "";
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    return parsed;
  }, [lines]);

  const formattedLines = useMemo(() => {
    let result = parsedLines;

    if (levelFilter !== "all") {
      result = result.filter(p => {
        if (!p.level) return levelFilter === "info";
        if (levelFilter === "error") return p.level === "error";
        if (levelFilter === "warn") return p.level === "error" || p.level === "warn";
        return true;
      });
    }

    return result.map(p => {
      if (!p.service) return p.raw;
      return showTimestamps
        ? `[${p.service}] ${p.timestamp}  ${p.message}`
        : `[${p.service}]  ${p.message}`;
    });
  }, [parsedLines, levelFilter, showTimestamps]);

  const extraToolbarItems = (
    <div className="lm-extra-controls">
      {services.length > 0 && (
        <select
          className="lm-select"
          value={selectedService}
          onChange={e => setSelectedService(e.target.value)}
        >
          <option value="">{t("logs_modal.service_all")}</option>
          {services.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      <div className="lm-level-filters">
        {(["all", "error", "warn", "info"] as LevelFilter[]).map(l => (
          <button
            key={l}
            type="button"
            className={`lm-level-chip lm-chip-${l}${levelFilter === l ? " lm-level-chip--active" : ""}`}
            onClick={() => setLevelFilter(l)}
          >
            {t(`logs_modal.level_${l}`)}
          </button>
        ))}
      </div>
      <Tooltip content={t("logs_modal.timestamps_tooltip")}>
        <Button
          variant={showTimestamps ? "secondary" : "plain"}
          size="sm"
          icon={<ClockIcon />}
          onClick={() => setShowTimestamps(v => !v)}
          aria-label={t("logs_modal.timestamps_tooltip")}
          aria-pressed={showTimestamps}
        />
      </Tooltip>
      {streaming && !paused && <Spinner size="sm" />}
      {lines.length >= LOG_MAX_LINES && (
        <span className="lm-limit-notice">{t("logs_modal.limit_notice", { count: LOG_MAX_LINES })}</span>
      )}
      {lines.length > 0 && (
        <Button
          variant="plain"
          size="sm"
          icon={<TimesIcon />}
          onClick={clear}
          aria-label={t("logs_modal.clear_button")}
          title={t("logs_modal.clear_button")}
        >
          {t("logs_modal.clear_button")}
        </Button>
      )}
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} variant="large" width="95vw" maxWidth="95vw" aria-label={t("logs_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("logs_modal.title", { name: stack.Name })} />
      <ModalBody>
        <LogViewer
          lines={formattedLines}
          paused={paused}
          onPause={streaming ? pause : undefined}
          onResume={streaming ? resume : undefined}
          onRefresh={restart}
          downloadFileName={`${stack.Name}-logs`}
          searchPlaceholder={t("logs_modal.search_placeholder")}
          emptyMessage={t("logs_modal.waiting")}
          extraToolbarItems={extraToolbarItems}
        />
      </ModalBody>
    </Modal>
  );
}
