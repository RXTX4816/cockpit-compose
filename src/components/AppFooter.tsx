import { PageSection } from "@patternfly/react-core";
// @ts-expect-error: ESM import assertion for JSON
import pkg from "../../package.json" assert { type: "json" };

export function AppFooter() {
  return (
    <PageSection
      variant="default"
      className="cc-footer"
      style={{
        borderTop: "1px solid",
        padding: "0.5rem 1.5rem",
        fontSize: 13,
        marginTop: "2.5rem",
        textAlign: "center"
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <span style={{ marginBottom: 2 }}>Version: {pkg.version}</span>
        <div style={{ display: "flex", flexDirection: "row", gap: 16, justifyContent: "center" }}>
          <a href="https://github.com/RXTX4816/cockpit-compose/wiki" target="_blank" rel="noopener noreferrer" style={{ color: "#0071c1", textDecoration: "none" }}>Help</a>
          <a href="https://github.com/RXTX4816/cockpit-compose/issues/new/choose" target="_blank" rel="noopener noreferrer" style={{ color: "#0071c1", textDecoration: "none" }}>Feedback / Report bug</a>
        </div>
      </div>
    </PageSection>
  );
}

