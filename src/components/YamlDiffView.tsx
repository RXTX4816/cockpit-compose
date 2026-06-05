import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@codemirror/theme-one-dark";
import { unifiedMergeView } from "@codemirror/merge";
import "./YamlEditor.css";

interface YamlDiffViewProps {
  original: string;
  modified: string;
}

export function YamlDiffView({ original, modified }: YamlDiffViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const isDarkMode = document.documentElement.classList.contains("pf-v6-theme-dark");

    const state = EditorState.create({
      doc: modified,
      extensions: [
        basicSetup,
        yaml(),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        unifiedMergeView({ original, mergeControls: false }),
        ...(isDarkMode ? [oneDark] : []),
      ],
    });

    const editor = new EditorView({ state, parent: containerRef.current });
    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  // original and modified are intentionally omitted: they are the initial values only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.state.doc.toString() !== modified) {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: modified },
      });
    }
  }, [modified]);

  return <div ref={containerRef} className="ye-editor" />;
}
