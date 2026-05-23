import { useState, useCallback, useEffect, useRef } from "react";
import { Button, TextInput } from "@patternfly/react-core";
import { EyeIcon, EyeSlashIcon, TrashAltIcon, PlusIcon, LockIcon, LockOpenIcon } from "@patternfly/react-icons";
import "./EnvTable.css";

type EnvRow =
  | { type: "comment"; text: string }
  | { type: "blank" }
  | { type: "entry"; key: string; value: string; sensitive: boolean; revealed: boolean };

const SENSITIVE = /PASSWORD|SECRET|TOKEN|KEY|API|DSN|PRIVATE/i;

function isSensitive(key: string): boolean {
  return SENSITIVE.test(key);
}

function parseContent(content: string): EnvRow[] {
  if (!content) return [];
  return content.split("\n").map(line => {
    if (line.startsWith("#")) return { type: "comment", text: line };
    if (line.trim() === "") return { type: "blank" };
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) return { type: "comment", text: line };
    const key = line.substring(0, eqIdx);
    return { type: "entry", key, value: line.substring(eqIdx + 1), sensitive: isSensitive(key), revealed: false };
  });
}

function serializeRows(rows: EnvRow[]): string {
  return rows.map(row => {
    if (row.type === "blank") return "";
    if (row.type === "comment") return row.text;
    return `${row.key}=${row.value}`;
  }).join("\n");
}

function hasDuplicateKeys(rows: EnvRow[]): boolean {
  const keys = rows.filter(r => r.type === "entry").map(r => (r as { type: "entry"; key: string }).key);
  return keys.length !== new Set(keys).size;
}

interface Props {
  content: string;
  onChange: (content: string) => void;
  onDuplicatesChange: (hasDuplicates: boolean) => void;
}

export function EnvTable({ content, onChange, onDuplicatesChange }: Props) {
  const [rows, setRows] = useState<EnvRow[]>(() => parseContent(content));
  // Track last serialized value to avoid re-parsing our own onChange emissions
  const lastEmittedRef = useRef<string>(content);

  useEffect(() => {
    if (content !== lastEmittedRef.current) {
      lastEmittedRef.current = content;
      setRows(parseContent(content));
    }
  }, [content]);

  const updateRows = useCallback((next: EnvRow[]) => {
    setRows(next);
    const serialized = serializeRows(next);
    lastEmittedRef.current = serialized;
    onChange(serialized);
    onDuplicatesChange(hasDuplicateKeys(next));
  }, [onChange, onDuplicatesChange]);

  const updateEntry = (idx: number, field: "key" | "value", val: string) => {
    updateRows(rows.map((row, i) => {
      if (i !== idx || row.type !== "entry") return row;
      if (field === "key") return { ...row, key: val, sensitive: isSensitive(val) };
      return { ...row, value: val };
    }));
  };

  const toggleSensitive = (idx: number) => {
    // Sensitivity is display-only — doesn't affect serialized content, so update rows directly
    setRows(prev => prev.map((row, i) => {
      if (i !== idx || row.type !== "entry") return row;
      const sensitive = !row.sensitive;
      return { ...row, sensitive, revealed: sensitive ? row.revealed : false };
    }));
  };

  const toggleReveal = (idx: number) => {
    setRows(prev => prev.map((row, i) => {
      if (i !== idx || row.type !== "entry") return row;
      return { ...row, revealed: !row.revealed };
    }));
  };

  const deleteRow = (idx: number) => {
    updateRows(rows.filter((_, i) => i !== idx));
  };

  const addRow = () => {
    updateRows([...rows, { type: "entry", key: "", value: "", sensitive: false, revealed: false }]);
  };

  const duplicateKeys = rows
    .filter(r => r.type === "entry")
    .map(r => (r as { type: "entry"; key: string }).key)
    .filter((k, i, arr) => k !== "" && arr.indexOf(k) !== i);

  return (
    <div className="env-table-wrap">
      <table className="env-table">
        <thead>
          <tr>
            <th className="env-col-key">Key</th>
            <th className="env-col-value">Value</th>
            <th className="env-col-actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.type === "comment") {
              return (
                <tr key={idx} className="env-row-comment">
                  <td colSpan={3} className="env-comment-text">{row.text}</td>
                </tr>
              );
            }
            if (row.type === "blank") return null;

            const masked = row.sensitive && !row.revealed;
            const isDuplicate = duplicateKeys.includes(row.key);

            return (
              <tr key={idx} className="env-row-entry">
                <td className="env-col-key">
                  <TextInput
                    value={row.key}
                    onChange={(_e, v) => updateEntry(idx, "key", v)}
                    aria-label="Variable key"
                    validated={isDuplicate ? "error" : "default"}
                    placeholder="KEY"
                  />
                </td>
                <td className="env-col-value">
                  <TextInput
                    value={row.value}
                    onChange={(_e, v) => updateEntry(idx, "value", v)}
                    aria-label="Variable value"
                    type={masked ? "password" : "text"}
                    placeholder="value"
                  />
                </td>
                <td className="env-col-actions">
                  <Button
                    variant="plain"
                    aria-label={row.sensitive ? "Mark as not sensitive" : "Mark as sensitive"}
                    onClick={() => toggleSensitive(idx)}
                  >
                    {row.sensitive ? <LockIcon /> : <LockOpenIcon />}
                  </Button>
                  {row.sensitive && (
                    <Button
                      variant="plain"
                      aria-label={row.revealed ? "Hide value" : "Show value"}
                      onClick={() => toggleReveal(idx)}
                    >
                      {row.revealed ? <EyeSlashIcon /> : <EyeIcon />}
                    </Button>
                  )}
                  <Button
                    variant="plain"
                    aria-label="Delete row"
                    onClick={() => deleteRow(idx)}
                  >
                    <TrashAltIcon />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Button variant="link" icon={<PlusIcon />} onClick={addRow} className="env-add-btn">
        Add variable
      </Button>
    </div>
  );
}
