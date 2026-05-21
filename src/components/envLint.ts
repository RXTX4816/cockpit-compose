import type { Diagnostic } from "@codemirror/lint";

export function lintEnvContent(text: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const lines = text.split("\n");
  const seenKeys = new Map<string, number>();
  let pos = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = pos;
    const lineEnd = pos + line.length;
    pos += line.length + 1; // +1 for newline

    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      diagnostics.push({
        from: lineStart,
        to: lineEnd,
        severity: "error",
        message: "Missing '=': expected KEY=VALUE",
      });
      continue;
    }

    const rawKey = line.substring(0, eqIdx);
    const key = rawKey.trim();

    if (rawKey !== key) {
      diagnostics.push({
        from: lineStart,
        to: lineStart + eqIdx,
        severity: "warning",
        message: "Avoid spaces around '='",
      });
    } else {
      const afterEq = line.substring(eqIdx + 1);
      if (afterEq !== afterEq.trimStart()) {
        diagnostics.push({
          from: lineStart + eqIdx + 1,
          to: lineEnd,
          severity: "warning",
          message: "Avoid spaces around '='",
        });
      }
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      diagnostics.push({
        from: lineStart,
        to: lineStart + rawKey.length,
        severity: "error",
        message: "Invalid key name: must start with a letter or underscore and contain only letters, digits, or underscores",
      });
      continue;
    }

    if (seenKeys.has(key)) {
      diagnostics.push({
        from: lineStart,
        to: lineStart + rawKey.length,
        severity: "warning",
        message: `Duplicate key: ${key}`,
      });
    } else {
      seenKeys.set(key, i);
    }
  }

  return diagnostics;
}
