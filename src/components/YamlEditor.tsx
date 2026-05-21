import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { yaml } from "@codemirror/lang-yaml";
import { linter } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { load } from "js-yaml";
import type { Diagnostic } from "@codemirror/lint";
import { validateComposeSpec } from "../compose-schema";
import "./YamlEditor.css";

interface YamlEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
  onDiagnosticsChange?: (diagnostics: Diagnostic[]) => void;
}

export function YamlEditor({ content, onChange, readOnly = false, onDiagnosticsChange }: YamlEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onDiagnosticsChangeRef = useRef(onDiagnosticsChange);

  // Keep callback refs current without recreating the editor
  useEffect(() => {
    onChangeRef.current = onChange;
    onDiagnosticsChangeRef.current = onDiagnosticsChange;
  }, [onChange, onDiagnosticsChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const yamlLinter = linter((view: EditorView) => {
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
        onDiagnosticsChangeRef.current?.(diagnostics);
        return diagnostics;
      }

      // Validate against Docker Compose schema
      if (parsed !== null && typeof parsed === 'object') {
        const schemaErrors = validateComposeSpec(parsed);
        if (schemaErrors.length > 0) {
          schemaErrors.forEach(errorMsg => {
            diagnostics.push({
              from: 0,
              to: Math.min(50, view.state.doc.length),
              severity: "warning",
              message: `Docker Compose: ${errorMsg}`,
            });
          });
        }
      }

      onDiagnosticsChangeRef.current?.(diagnostics);
      return diagnostics;
    });

    const extensions: Extension[] = [basicSetup, yaml(), yamlLinter];

    if (readOnly) {
      extensions.push(EditorView.editable.of(false));
    } else {
      const updateListener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      });
      extensions.push(updateListener);
    }

    const isDarkMode = document.documentElement.classList.contains('pf-v6-theme-dark');
    if (isDarkMode) {
      extensions.push(oneDark);
    }

    const state = EditorState.create({
      doc: content,
      extensions,
    });

    const editor = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  // content is intentionally omitted: it's only the initial doc value.
  // Callbacks are accessed via refs so they don't trigger recreation either.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  // Sync externally-driven content changes (e.g. snapshot restore) into the
  // live editor without recreating it. Skips the dispatch when the editor
  // already holds the same text (e.g. after the user just typed a character).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.state.doc.toString() !== content) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: content },
      });
    }
  }, [content]);

  return <div ref={containerRef} className="ye-editor" />;
}
