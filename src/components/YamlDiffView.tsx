import { useMemo } from "react";
import { yaml } from "@codemirror/lang-yaml";
import { DiffEditor } from "@rxtx4816/cockpit-plugin-base-react/components";

interface YamlDiffViewProps {
  original: string;
  modified: string;
}

export function YamlDiffView({ original, modified }: YamlDiffViewProps) {
  const extensions = useMemo(() => [yaml()], []);
  return (
    <DiffEditor
      original={original}
      modified={modified}
      extensions={extensions}
      className="ye-editor"
    />
  );
}
