import { Component, type ReactNode, type ErrorInfo } from "react";

/**
 * Простой error boundary — ловит JS-ошибки в дереве компонентов и
 * показывает дружелюбное сообщение вместо белого экрана. В DevTools
 * пишет полный stack trace через console.error.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 rounded-2xl bg-surface p-10 text-center shadow-card-sm">
          <div className="text-[16px] font-bold text-red-600">
            Что-то пошло не так
          </div>
          <div className="max-w-md text-[12px] text-muted-2">
            {this.state.error.message ?? String(this.state.error)}
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="rounded-[10px] bg-ink px-4 py-2 text-[12px] font-bold text-white hover:bg-blue-600"
          >
            Попробовать снова
          </button>
          <div className="max-w-md text-[10px] text-muted-2">
            Если ошибка повторяется — открой DevTools (F12) → Console и
            скинь сообщение разработчику.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
