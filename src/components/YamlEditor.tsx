import { useMemo } from "react";
import { yaml } from "@codemirror/lang-yaml";
import { linter } from "@codemirror/lint";
import { load } from "js-yaml";
import type { Diagnostic } from "@codemirror/lint";
import { CodeEditor } from "@rxtx4816/cockpit-plugin-base-react/components";
import { validateComposeSpec } from "../compose-schema";

interface YamlEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  onDiagnosticsChange?: (diagnostics: Diagnostic[]) => void;
}

export function YamlEditor({ content, onChange, readOnly = false, onDiagnosticsChange }: YamlEditorProps) {
  const extensions = useMemo(() => {
    const yamlLinter = linter((view) => {
      const diagnostics: Diagnostic[] = [];
      let parsed: unknown;

      try {
        parsed = load(view.state.doc.toString());
      } catch (err) {
        const error = err as { mark?: { line: number; column: number }; message: string };
        if (error.mark !== undefined) {
          const line = error.mark.line;
          const col = error.mark.column;
          const lineStart = view.state.doc.line(line + 1).from;
          const lineEnd = view.state.doc.line(line + 1).to;
          diagnostics.push({
            from: Math.max(lineStart, lineStart + col),
            to: Math.min(lineEnd, lineStart + col + 20),
            severity: "error",
            message: error.message || "Invalid YAML",
          });
        }
        onDiagnosticsChange?.(diagnostics);
        return diagnostics;
      }

      if (parsed !== null && typeof parsed === "object") {
        const schemaErrors = validateComposeSpec(parsed);
        schemaErrors.forEach(errorMsg => {
          diagnostics.push({
            from: 0,
            to: Math.min(50, view.state.doc.length),
            severity: "warning",
            message: `Docker Compose: ${errorMsg}`,
          });
        });
      }

      onDiagnosticsChange?.(diagnostics);
      return diagnostics;
    });

    return [yaml(), yamlLinter];
  // onDiagnosticsChange is a callback; stable reference expected from caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CodeEditor
      content={content}
      onChange={onChange}
      readOnly={readOnly}
      extensions={extensions}
      className="ye-editor"
    />
  );
}
