import { useState, useEffect, useCallback } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Spinner,
  Alert,
} from "@patternfly/react-core";
import { type ComposeStack, type ComposeTopEntry, composeTop } from "../api";
import "./TopModal.css";

interface Props {
  stack: ComposeStack;
  onClose: () => void;
}

// Known ps column names — used to detect the header line in docker compose top output
const PS_COLUMNS = new Set([
  "UID", "PID", "PPID", "USER", "CMD", "COMMAND", "TTY", "TIME",
  "STIME", "C", "STAT", "%CPU", "%MEM", "VSZ", "RSS", "NI", "PRI",
  "START", "ELAPSED", "ARGS", "F", "S", "WCHAN",
]);

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function isHeaderLine(line: string): boolean {
  const words = line.trim().split(/\s+/);
  return words.filter(w => PS_COLUMNS.has(w)).length >= 3;
}

function parseTopOutput(raw: string): ComposeTopEntry[] {
  const entries: ComposeTopEntry[] = [];
  const cleaned = raw.split("\n").map(l => stripAnsi(l.trimEnd()));

  // Split into non-empty blocks separated by blank lines
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of cleaned) {
    if (!line.trim()) {
      if (current.length > 0) { blocks.push(current); current = []; }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  for (const block of blocks) {
    if (block.length < 2) continue;
    const headerIdx = block.findIndex(isHeaderLine);
    if (headerIdx < 0) continue;

    const service = block.slice(0, headerIdx).join(" ").trim() || `Service ${entries.length + 1}`;
    const headerLine = block[headerIdx];
    const colStarts = [...headerLine.matchAll(/\S+/g)].map(m => m.index as number);
    const splitRow = (line: string) =>
      colStarts.map((start, i) => line.slice(start, colStarts[i + 1]).trim());
    const titles = splitRow(headerLine);
    const processes = block.slice(headerIdx + 1).map(l => splitRow(l));
    entries.push({ service, titles, processes });
  }
  return entries;
}

export function TopModal({ stack, onClose }: Props) {
  const [entries, setEntries] = useState<ComposeTopEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    let raw = "";
    const proc = composeTop(stack.Name);
    proc.stream(d => { raw += d; });
    proc
      .then(() => {
        setEntries(parseTopOutput(raw));
        setLoading(false);
      })
      .catch((ex: unknown) => {
        setError(ex instanceof Error ? ex.message : String(ex));
        setLoading(false);
      });
  }, [stack.Name]);

  useEffect(() => { load(); }, [load]);

  return (
    <Modal isOpen onClose={onClose} variant="large" aria-label={`Top — ${stack.Name}`}>
      <ModalHeader title={`Top — ${stack.Name}`} />
      <ModalBody>
        <Toolbar className="tm-toolbar">
          <ToolbarContent>
            <ToolbarItem>
              <Button variant="secondary" size="sm" onClick={load} isDisabled={loading}>
                Refresh
              </Button>
            </ToolbarItem>
            {loading && (
              <ToolbarItem>
                <Spinner size="sm" />
              </ToolbarItem>
            )}
          </ToolbarContent>
        </Toolbar>

        {error && (
          <Alert variant="danger" isInline title="Could not load processes" style={{ marginTop: "0.5rem" }}>
            {error}
          </Alert>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="tm-empty">No running processes found.</div>
        )}

        {entries.map(entry => (
          <div key={entry.service} className="tm-service-section">
            <div className="tm-service-name">{entry.service}</div>
            <table className="tm-table">
              <thead>
                <tr>
                  {entry.titles.map(title => (
                    <th key={title}>{title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entry.processes.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}

export { parseTopOutput };
