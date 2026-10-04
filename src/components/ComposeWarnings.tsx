import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "@patternfly/react-core";
import { extractComposeWarnings } from "../lib/composeWarnings";

/**
 * Lifts Docker Compose's warnings out of a streamed log into a readable box above it,
 * e.g. attributes that have no effect outside Swarm (Compose 5.6.0+). The log itself is
 * left as it is; renders nothing when there are no warnings.
 */
export function ComposeWarnings({ lines }: { lines: string[] }) {
  const { t } = useTranslation();
  const warnings = useMemo(() => extractComposeWarnings(lines), [lines]);
  if (warnings.length === 0) return null;
  return (
    <Alert
      variant="warning"
      isInline
      isPlain
      title={t("compose_warnings.title")}
      style={{ marginBottom: "0.75rem" }}
    >
      <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {warnings.map(w => <li key={w}>{w}</li>)}
      </ul>
    </Alert>
  );
}
