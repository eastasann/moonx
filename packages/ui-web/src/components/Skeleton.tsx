import { createContext, type ReactNode, useContext } from "react";
import * as styles from "./Skeleton.css";

const SkeletonContext = createContext(false);

export interface SkeletonProps {
  /** While true, the children show as their skeleton. */
  isLoading: boolean;
  /**
   * The screen's own layout with placeholder text: Text and Heading inside draw bars the
   * size of their words, so the skeleton has the shape of the screen (design-spec 6.0.6).
   */
  children: ReactNode;
}

/**
 * The loading skeleton of a screen or block (design-spec 4.5・6.0.6). While loading, the
 * children are inert: hidden from screen readers and out of the tab order, so the
 * placeholder text is never read. The screen tells that it is loading on its own.
 */
export function Skeleton({ isLoading, children }: SkeletonProps) {
  if (!isLoading) return children;
  return (
    <SkeletonContext.Provider value>
      <div inert className={styles.root}>
        {children}
      </div>
    </SkeletonContext.Provider>
  );
}

/**
 * Wraps text in its skeleton bar while a `Skeleton` around it is loading (Text, Heading).
 */
export function SkeletonText({ children }: { children: ReactNode }) {
  const isLoading = useContext(SkeletonContext);
  return isLoading ? <span className={styles.text}>{children}</span> : children;
}
