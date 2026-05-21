import { useState, useEffect } from "react";
import { Page, PageSection } from "@patternfly/react-core";
import { AppFooter } from "./AppFooter";
import { StacksView } from "./StacksView";
import { ErrorBoundary } from "./ErrorBoundary";
import { detectComposeCommand } from "../api";

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void detectComposeCommand().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <Page className="pf-m-no-sidebar">
      <PageSection hasBodyWrapper={false} isFilled>
        <ErrorBoundary fallbackTitle="Error loading stacks">
          <StacksView />
        </ErrorBoundary>
      </PageSection>
      <AppFooter />
    </Page>
  );
}
