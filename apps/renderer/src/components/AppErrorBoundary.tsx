import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "Unexpected renderer error."
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("AppErrorBoundary", error, errorInfo);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07141f] px-6 py-10 text-white">
        <section className="w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/10 p-8 shadow-card backdrop-blur">
          <div className="text-xs uppercase tracking-[0.18em] text-rose-200">Unexpected error</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">The page hit a rendering error.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-200">{this.state.message}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-[#07141f]"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload app
            </button>
            <Link
              className="rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white"
              to="/"
            >
              Back to library
            </Link>
          </div>
        </section>
      </main>
    );
  }
}
