import { AlertDialog } from "@moonx/ui-web";
import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { reportOnce, UnexpectedState } from "./states";

interface ErrorBoundaryProps {
  /** What shows instead of the children once they fail to render. */
  fallback: (failure: {
    reference: string | null;
    retry: () => void;
  }) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasFailed: boolean;
  reference: string | null;
}

/**
 * Catches a failure to render what is inside, so it does not take the screen down with
 * it (SDD 8.2): the failure goes to Sentry, and its event id is the `Ref` the fallback
 * shows. Retry renders the children again.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasFailed: false, reference: null };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasFailed: true };
  }

  // Reported once the failure is final: React renders again after a failure before it
  // gives up, and each attempt throws an error of its own.
  override componentDidCatch(error: unknown) {
    this.setState({ reference: reportOnce(error) });
  }

  retry = () => this.setState({ hasFailed: false, reference: null });

  override render() {
    const { hasFailed, reference } = this.state;
    if (!hasFailed) return this.props.children;
    return this.props.fallback({ reference, retry: this.retry });
  }
}

/** A block of a screen that fails alone: the others stay (SDD 8.2). */
export function BlockBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={({ reference, retry }) => (
        <UnexpectedState
          headingLevel={3}
          size="S"
          reference={reference}
          onRetry={retry}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * A modal or panel that fails to render (design-spec 6.0.6, SDD 8.2): a small dialog with
 * "Something went wrong", its Ref, Retry and Close; the frame and the screen behind stay
 * usable. Give it a `key` of what is open, so opening another starts it afresh.
 */
export function ModalBoundary({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation(["app"]);
  return (
    <ErrorBoundary
      fallback={({ reference, retry }) => (
        <AlertDialog
          isOpen
          variant="error"
          size="S"
          title={t("app:state.unexpected")}
          primaryActionLabel={t("app:state.retry")}
          cancelLabel={t("app:state.close")}
          onPrimaryAction={retry}
          onCancel={onClose}
        >
          {reference === null
            ? ""
            : t("app:state.ref", { ref: reference.slice(0, 8) })}
        </AlertDialog>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
