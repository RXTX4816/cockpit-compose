import { useEffect, useRef, useMemo, useState, type ReactNode } from "react";
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
} from "@patternfly/react-core";
import { SyncAltIcon, PlayIcon, PauseIcon, TimesIcon } from "@patternfly/react-icons";
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

function highlightSearch(message: string, term: string): ReactNode {
  if (!term) return highlightMessage(message);
  const lower = message.toLowerCase();
  const termLower = term.toLowerCase();
  const result: ReactNode[] = [];
  let pos = 0;
  while (true) {
    const idx = lower.indexOf(termLower, pos);
    if (idx === -1) {
      result.push(highlightMessage(message.slice(pos)));
      break;
    }
    if (idx > pos) result.push(highlightMessage(message.slice(pos, idx)));
    result.push(<mark key={idx} className="lm-search-match">{message.slice(idx, idx + term.length)}</mark>);
    pos = idx + term.length;
  }
  return result;
}

// ── LogLine component ──────────────────────────────────────────────────────────

function LogLine({ parsed, index, searchTerm }: { parsed: ParsedLine; index: number; searchTerm: string }) {
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
      <span className={`lm-line-timestamp ${bgClass}`}>{parsed.timestamp}</span>
      <span className={`lm-line-message ${msgClass} ${bgClass}`}>
        {highlightSearch(parsed.message, searchTerm)}
      </span>
    </div>
  );
}

// ── LogsModal ──────────────────────────────────────────────────────────────────

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

export function LogsModal({ stack, onClose }: Props) {
  const { t } = useTranslation();
  const [selectedService, setSelectedService] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [services, setServices] = useState<string[]>([]);

  const configFile = splitConfigFiles(stack.ConfigFiles)[0] ?? "";

  useEffect(() => {
    let raw = "";
    const proc = readComposeFile(configFile);
    proc.stream(d => { raw += d; });
    proc.then(() => setServices(getServicesFromCompose(raw))).catch(() => {});
  }, [configFile]);

  const { lines, streaming, paused, pause, resume, restart, clear } = useLogStream(
    stack.Name,
    selectedService || undefined,
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
    if (!searchTerm) return parsedLines;
    const lower = searchTerm.toLowerCase();
    return parsedLines.filter(p => p.raw.toLowerCase().includes(lower));
  }, [parsedLines, searchTerm]);

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
                <SearchInput
                  className="lm-search-input"
                  value={searchTerm}
                  onChange={(_e, v) => setSearchTerm(v)}
                  onClear={() => setSearchTerm("")}
                  placeholder={t("logs_modal.search_placeholder")}
                />
              </ToolbarItem>
              {lines.length >= LOG_MAX_LINES && (
                <ToolbarItem>
                  <span className="lm-limit-notice">{t("logs_modal.limit_notice", { count: LOG_MAX_LINES })}</span>
                </ToolbarItem>
              )}
            </ToolbarGroup>

            <ToolbarGroup variant="action-group-plain" align={{ default: "alignEnd" }}>
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
              {lines.length > 0 && (
                <ToolbarItem>
                  <Button variant="plain" size="sm" icon={<TimesIcon />} onClick={clear} aria-label={t("logs_modal.clear_button")} title={t("logs_modal.clear_button")}>{t("logs_modal.clear_button")}</Button>
                </ToolbarItem>
              )}
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>

        <div ref={logRef} className="lm-log-viewer">
          {displayedLines.length === 0 ? (
            <div className="lm-empty-state">{t("logs_modal.waiting")}</div>
          ) : (
            displayedLines.map((p, i) => <LogLine key={i} parsed={p} index={i} searchTerm={searchTerm} />)
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
