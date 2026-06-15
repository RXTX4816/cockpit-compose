import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Page, PageSection } from "@patternfly/react-core";
import { AppFooter } from "./AppFooter";
import { StacksView } from "./StacksView";
import { ErrorBoundary } from "./ErrorBoundary";
import { detectComposeCommand, detectDockerMode, type Runtime } from "../api";

export function App() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [runtime, setRuntime] = useState<Runtime>(
    () => (localStorage.getItem("cockpit-compose:runtime") ?? "docker") as Runtime,
  );

  useEffect(() => {
    void detectDockerMode().then(() => detectComposeCommand()).then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <Page className="pf-m-no-sidebar">
      <PageSection hasBodyWrapper={false} isFilled>
        <ErrorBoundary fallbackTitle={t("error_boundary.load_stacks_error")}>
          <StacksView onRuntimeChange={setRuntime} />
        </ErrorBoundary>
      </PageSection>
      <AppFooter runtime={runtime} />
    </Page>
  );
}
