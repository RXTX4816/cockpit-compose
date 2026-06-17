import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState, type Extension } from "@codemirror/state";
import { linter } from "@codemirror/lint";
import { oneDark } from "@codemirror/theme-one-dark";
import { lintEnvContent } from "../lib/envLint";
import "./YamlEditor.css";

interface EnvEditorProps {
  content: string;
  onChange: (content: string) => void;
  readOnly?: boolean;
}

export function EnvEditor({ content, onChange, readOnly = false }: EnvEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const envLinter = linter((view: EditorView) => lintEnvContent(view.state.doc.toString()));

    const extensions: Extension[] = [basicSetup, envLinter];

    if (readOnly) {
      extensions.push(EditorView.editable.of(false));
    } else {
      extensions.push(
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      );
    }

    const isDarkMode = document.documentElement.classList.contains("pf-v6-theme-dark");
    if (isDarkMode) extensions.push(oneDark);

    const state = EditorState.create({ doc: content, extensions });
    const editor = new EditorView({ state, parent: containerRef.current });
    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  // content is intentionally omitted: it's only the initial doc value.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

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
