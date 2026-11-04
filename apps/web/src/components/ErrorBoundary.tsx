import { AlertDialog } from "@moonx/ui-web";
import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { reportOnce } from "../lib/failure";
import { UnexpectedState } from "./states";

interface ErrorBoundaryProps {
  /** What shows instead of the children once they fail to render. */
  fallback: (failure: {
    reference: string | null;
    retry: () => void;
  }) => ReactNode;
  /**
   * Once failed, a change of it renders the children again, as Retry does; while they
   * render, a change leaves them as they are.
   */
  resetKey?: unknown;
  children: ReactNode;
}

/** What `failedAt` holds until the failure is caught. */
const NOT_CAUGHT = Symbol("not caught");

interface ErrorBoundaryState {
  hasFailed: boolean;
  reference: string | null;
  /** The `resetKey` the failure was caught at. */
  failedAt: unknown;
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
  override state: ErrorBoundaryState = {
    hasFailed: false,
    reference: null,
    failedAt: NOT_CAUGHT,
  };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasFailed: true };
  }

  // Reported once the failure is final: React renders again after a failure before it
  // gives up, and each attempt throws an error of its own.
  override componentDidCatch(error: unknown) {
    this.setState({
      reference: reportOnce(error),
      failedAt: this.props.resetKey,
    });
  }

  // Compared with where the failure was caught, not with the last render: a failure that
  // came with a new `resetKey` is not tried again, and reported again, for it.
  override componentDidUpdate() {
    const { hasFailed, failedAt } = this.state;
    if (
      hasFailed &&
      failedAt !== NOT_CAUGHT &&
      failedAt !== this.props.resetKey
    ) {
      this.retry();
    }
  }

  retry = () =>
    this.setState({ hasFailed: false, reference: null, failedAt: NOT_CAUGHT });

  override render() {
    const { hasFailed, reference } = this.state;
    if (!hasFailed) return this.props.children;
    return this.props.fallback({ reference, retry: this.retry });
  }
}

/**
 * The body of a screen in its frame (SDD 8.2, design-spec 6.0.6「想定外のエラー」): a
 * screen that fails to render shows "Something went wrong" with its Ref and Retry where
 * its body was, and the frame and its navigation stay usable. Moving to another path
 * (another screen, or another item of the same one) renders it again.
 */
export function ScreenBoundary({
  path,
  children,
}: {
  /** The path open: once failed, a move to another renders the screen again. */
  path: string;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary
      resetKey={path}
      fallback={({ reference, retry }) => (
        <UnexpectedState reference={reference} onRetry={retry} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
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
