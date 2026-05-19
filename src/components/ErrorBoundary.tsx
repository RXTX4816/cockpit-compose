import { Component, type ReactNode } from "react";
import { EmptyState, EmptyStateBody } from "@patternfly/react-core";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <EmptyState headingLevel="h2" titleText={this.props.fallbackTitle ?? "Something went wrong"}>
          <EmptyStateBody>{this.state.error.message}</EmptyStateBody>
        </EmptyState>
      );
    }
    return this.props.children;
  }
}
