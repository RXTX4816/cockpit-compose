import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Page, PageSection } from "@patternfly/react-core";
import { useLayout } from "@rxtx4816/cockpit-plugin-base-react";
import { AppFooter } from "./AppFooter";
import { StacksView } from "./StacksView";
import { ErrorBoundary } from "./ErrorBoundary";
import { ToastProvider } from "./ToastProvider";
import { detectComposeCommand, detectDockerMode, type Runtime } from "../api";
import { type Layout, LAYOUT_KEY } from "../lib/layout";
import "./layouts.css";

export function App() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [runtime, setRuntime] = useState<Runtime>(
    () => (localStorage.getItem("cockpit-compose:runtime") ?? "docker") as Runtime,
  );
  const [dockerMissing, setDockerMissing] = useState(false);
  const [layout, setLayout] = useLayout<Layout>(
    LAYOUT_KEY, "poweruser", ["minimal", "poweruser", "pretty", "unix"],
    { crossTabSync: true },
  );
  const initialRuntime = useRef(runtime);

  useEffect(() => {
    void detectDockerMode()
      .then(() => detectComposeCommand())
      .then(found => {
        if (initialRuntime.current === "docker" && !found) setDockerMissing(true);
        setReady(true);
      });
  }, []);

  if (!ready) return null;

  return (
    <ToastProvider>
      <div data-layout={layout}>
        <Page className="pf-m-no-sidebar">
          <PageSection hasBodyWrapper={false} isFilled>
            <ErrorBoundary fallbackTitle={t("error_boundary.load_stacks_error")}>
              <StacksView
                onRuntimeChange={setRuntime}
                dockerMissing={dockerMissing}
                layout={layout}
                onLayoutChange={setLayout}
              />
            </ErrorBoundary>
          </PageSection>
          <AppFooter runtime={runtime} />
        </Page>
      </div>
    </ToastProvider>
  );
}
