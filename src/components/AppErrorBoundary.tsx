import { Component, type ErrorInfo, type ReactNode } from "react";
import PageError from "./PageError";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export default class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught:", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <PageError
            title="Application error"
            message="Something went wrong. Try again or reload the page."
            details={this.state.error?.stack ?? this.state.error?.message}
            onRetry={this.handleRetry}
            onReload
          />
        </div>
      );
    }
    return this.props.children;
  }
}
