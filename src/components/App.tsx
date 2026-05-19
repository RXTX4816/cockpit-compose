import { Page, PageSection } from "@patternfly/react-core";
import { StacksView } from "./StacksView";
import { ErrorBoundary } from "./ErrorBoundary";

export function App() {
  return (
    <Page className="pf-m-no-sidebar">
      <PageSection hasBodyWrapper={false} isFilled>
        <ErrorBoundary fallbackTitle="Error loading stacks">
          <StacksView />
        </ErrorBoundary>
      </PageSection>
    </Page>
  );
}
