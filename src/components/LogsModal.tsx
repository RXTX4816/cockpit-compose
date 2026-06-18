import { useEffect, useRef, useMemo, useState, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  ModalHeader,
  ModalBody,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  ToolbarGroup,
  Spinner,
  SearchInput,
  Tooltip,
  Label,
} from "@patternfly/react-core";
import {
  SyncAltIcon, PlayIcon, PauseIcon, TimesIcon, DownloadIcon,
  AngleDoubleUpIcon, AngleDoubleDownIcon, ClockIcon,
} from "@patternfly/react-icons";
import { type ComposeStack, readComposeFile, getServicesFromCompose } from "../api";
import {
  serviceColor,
  highlightMessage,
  parseLine,
  type ParsedLine,
} from "../lib/logParser";
import { useLogStream, LOG_MAX_LINES } from "../hooks/useLogStream";
import "./LogsModal.css";
import { splitConfigFiles } from "../lib/configFiles";

// ── Search highlighting ────────────────────────────────────────────────────────

function highlightSearch(message: string, term: string, isRegex: boolean): ReactNode {
  if (!term) return highlightMessage(message);
  try {
    const re = isRegex ? new RegExp(term, "gi") : new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const parts: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(message)) !== null) {
      if (m.index > last) parts.push(highlightMessage(message.slice(last, m.index)));
      parts.push(<mark key={m.index} className="lm-search-match">{m[0]}</mark>);
      last = m.index + m[0].length;
      if (m[0].length === 0) { re.lastIndex++; }
    }
    if (last < message.length) parts.push(highlightMessage(message.slice(last)));
    return parts.length > 0 ? parts : highlightMessage(message);
  } catch {
    return highlightMessage(message);
  }
}

// ── LogLine component ──────────────────────────────────────────────────────────

function LogLine({
  parsed, index, searchTerm, isRegex, showTimestamps,
}: {
  parsed: ParsedLine;
  index: number;
  searchTerm: string;
  isRegex: boolean;
  showTimestamps: boolean;
}) {
  const isEven = index % 2 === 0;

  if (!parsed.service) {
    return (
      <div className={`lm-line-raw ${isEven ? "lm-bg-even" : "lm-bg-odd"}`}>
        {parsed.raw}
      </div>
    );
  }

  const bgClass = parsed.level === "error" ? "lm-bg-error"
    : parsed.level === "warn" ? "lm-bg-warn"
    : isEven ? "lm-bg-even" : "lm-bg-odd";

  const msgClass = parsed.level === "error" ? "lm-msg-error"
    : parsed.level === "warn" ? "lm-msg-warn"
    : "lm-msg-default";

  return (
    <div className="lm-line-parsed">
      <span className={`lm-line-service ${bgClass}`} style={{ color: serviceColor(parsed.service) }}>
        {parsed.service}
      </span>
      {showTimestamps && (
        <span className={`lm-line-timestamp ${bgClass}`}>{parsed.timestamp}</span>
      )}
      <span className={`lm-line-message ${msgClass} ${bgClass}${!showTimestamps ? " lm-line-message--no-ts" : ""}`}>
        {highlightSearch(parsed.message, searchTerm, isRegex)}
      </span>
    </div>
  );
}

// ── LogsModal ──────────────────────────────────────────────────────────────────

type LevelFilter = "all" | "error" | "warn" | "info";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
  initialService?: string;
}

export function LogsModal({ stack, onClose, initialService }: Props) {
  const { t } = useTranslation();
  const [selectedService, setSelectedService] = useState(initialService ?? "");
  const [searchTerm, setSearchTerm] = useState("");
  const [isRegex, setIsRegex] = useState(false);
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
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paused && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, paused]);

  const parsedLines = useMemo(() => {
    const parsed = lines.map(parseLine);
    parsed.sort((a, b) => {
      const ta = a.raw.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/)?.[0] ?? "";
      const tb = b.raw.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/)?.[0] ?? "";
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    return parsed;
  }, [lines]);

  const displayedLines = useMemo(() => {
    let result = parsedLines;

    if (levelFilter !== "all") {
      result = result.filter(p => {
        if (!p.level) return levelFilter === "info";
        if (levelFilter === "error") return p.level === "error";
        if (levelFilter === "warn") return p.level === "error" || p.level === "warn";
        return true;
      });
    }

    if (searchTerm) {
      try {
        if (isRegex) {
          const re = new RegExp(searchTerm, "i");
          result = result.filter(p => re.test(p.raw));
        } else {
          const lower = searchTerm.toLowerCase();
          result = result.filter(p => p.raw.toLowerCase().includes(lower));
        }
      } catch { /* invalid regex — show all */ }
    }

    return result;
  }, [parsedLines, searchTerm, levelFilter, isRegex]);

  const scrollToTop = useCallback(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, []);

  const handleDownload = useCallback(() => {
    const text = displayedLines.map(p => p.raw).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${stack.Name}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayedLines, stack.Name]);

  const levelColors: Record<LevelFilter, "grey" | "red" | "orange" | "blue"> = {
    all: "grey", error: "red", warn: "orange", info: "blue",
  };

  return (
    <Modal isOpen onClose={onClose} variant="large" width="95vw" maxWidth="95vw" aria-label={t("logs_modal.aria_label", { name: stack.Name })}>
      <ModalHeader title={t("logs_modal.title", { name: stack.Name })} />
      <ModalBody>
        <Toolbar className="lm-toolbar">
          <ToolbarContent>
            <ToolbarGroup variant="filter-group">
              {services.length > 0 && (
                <ToolbarItem>
                  <select
                    className="lm-select"
                    value={selectedService}
                    onChange={e => setSelectedService(e.target.value)}
                  >
                    <option value="">{t("logs_modal.service_all")}</option>
                    {services.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </ToolbarItem>
              )}

              <ToolbarItem>
                <div className="lm-search-wrap">
                  <SearchInput
                    className="lm-search-input"
                    value={searchTerm}
                    onChange={(_e, v) => setSearchTerm(v)}
                    onClear={() => setSearchTerm("")}
                    placeholder={t("logs_modal.search_placeholder")}
                  />
                  <Tooltip content={t("logs_modal.regex_tooltip")}>
                    <button
                      className={`lm-regex-btn${isRegex ? " lm-regex-btn--active" : ""}`}
                      onClick={() => setIsRegex(r => !r)}
                      aria-label={t("logs_modal.regex_tooltip")}
                      aria-pressed={isRegex}
                      type="button"
                    >
                      .*
                    </button>
                  </Tooltip>
                </div>
              </ToolbarItem>

              <ToolbarItem>
                <div className="lm-level-filters">
                  {(["all", "error", "warn", "info"] as LevelFilter[]).map(l => (
                    <Label
                      key={l}
                      isCompact
                      color={levelColors[l]}
                      className={`lm-level-chip${levelFilter === l ? " lm-level-chip--active" : ""}`}
                      onClick={() => setLevelFilter(l)}
                    >
                      {t(`logs_modal.level_${l}`)}
                    </Label>
                  ))}
                </div>
              </ToolbarItem>

              {lines.length >= LOG_MAX_LINES && (
                <ToolbarItem>
                  <span className="lm-limit-notice">{t("logs_modal.limit_notice", { count: LOG_MAX_LINES })}</span>
                </ToolbarItem>
              )}
            </ToolbarGroup>

            <ToolbarGroup variant="action-group-plain" align={{ default: "alignEnd" }}>
              <ToolbarItem>
                <span className="lm-line-count">
                  {displayedLines.length !== parsedLines.length
                    ? t("logs_modal.line_count_filtered", { shown: displayedLines.length, total: parsedLines.length })
                    : t("logs_modal.line_count", { count: parsedLines.length })
                  }
                </span>
              </ToolbarItem>

              <ToolbarItem>
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
              </ToolbarItem>

              <ToolbarItem>
                <Tooltip content={t("logs_modal.scroll_top")}>
                  <Button variant="plain" size="sm" icon={<AngleDoubleUpIcon />} onClick={scrollToTop} aria-label={t("logs_modal.scroll_top")} />
                </Tooltip>
              </ToolbarItem>
              <ToolbarItem>
                <Tooltip content={t("logs_modal.scroll_bottom")}>
                  <Button variant="plain" size="sm" icon={<AngleDoubleDownIcon />} onClick={scrollToBottom} aria-label={t("logs_modal.scroll_bottom")} />
                </Tooltip>
              </ToolbarItem>

              {streaming && !paused && (
                <ToolbarItem><Spinner size="sm" /></ToolbarItem>
              )}
              {streaming && (
                <ToolbarItem>
                  {paused
                    ? <Button variant="primary" size="sm" icon={<PlayIcon />} onClick={resume}>{t("logs_modal.continue_button")}</Button>
                    : <Button variant="secondary" size="sm" icon={<PauseIcon />} onClick={pause}>{t("logs_modal.pause_button")}</Button>
                  }
                </ToolbarItem>
              )}
              <ToolbarItem>
                <Button
                  variant="plain"
                  size="sm"
                  onClick={restart}
                  aria-label={t("logs_modal.refresh_button")}
                  title={t("logs_modal.refresh_button")}
                >
                  <SyncAltIcon />
                </Button>
              </ToolbarItem>
              {displayedLines.length > 0 && (
                <ToolbarItem>
                  <Tooltip content={t("logs_modal.download_tooltip")}>
                    <Button variant="plain" size="sm" icon={<DownloadIcon />} onClick={handleDownload} aria-label={t("logs_modal.download_tooltip")} />
                  </Tooltip>
                </ToolbarItem>
              )}
              {lines.length > 0 && (
                <ToolbarItem>
                  <Button variant="plain" size="sm" icon={<TimesIcon />} onClick={clear} aria-label={t("logs_modal.clear_button")} title={t("logs_modal.clear_button")}>{t("logs_modal.clear_button")}</Button>
                </ToolbarItem>
              )}
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>

        <div
          ref={logRef}
          className={`lm-log-viewer${!showTimestamps ? " lm-log-viewer--no-ts" : ""}`}
        >
          {displayedLines.length === 0 ? (
            <div className="lm-empty-state">{t("logs_modal.waiting")}</div>
          ) : (
            displayedLines.map((p, i) => (
              <LogLine
                key={i}
                parsed={p}
                index={i}
                searchTerm={searchTerm}
                isRegex={isRegex}
                showTimestamps={showTimestamps}
              />
            ))
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
