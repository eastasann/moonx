import { type ReactNode, useId } from "react";
import { Heading } from "../components/Heading";
import * as styles from "./preview.css";

/** A titled part of the gallery; E2E finds it as a region by its title. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={styles.section}>
      <Heading level={2} id={id}>
        {title}
      </Heading>
      {children}
    </section>
  );
}

/** One case of a component, named by the props it shows. */
export function Specimen({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.specimen}>
      <span className={styles.caption}>{name}</span>
      {children}
    </div>
  );
}

/** A labelled box that makes a layout component's children visible. */
export function Box({ children }: { children: ReactNode }) {
  return <div className={styles.box}>{children}</div>;
}
