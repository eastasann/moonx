import type { ScreenDensity, Size } from "@moonx/ui-tokens";
import type { FormEvent, ReactNode } from "react";
import { Form as AriaForm } from "react-aria-components";
import { SizeContext } from "../internal/size";
import * as styles from "./Form.css";

export interface FormProps {
  /**
   * The screen's density (design-spec 4.4): spacing between the fields, and their size
   * (regular M, spacious L, as 06 semantic.density says).
   * @default "regular"
   */
  density?: ScreenDensity;
  /** The size of the fields and Buttons inside, in place of the density's. */
  size?: Size;
  /**
   * Reasons by field `name`, from the screen's Zod check or the API's 422. Each field shows
   * its own under it.
   */
  validationErrors?: Record<string, string | string[]>;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children: ReactNode;
}

/**
 * Fields and the submit button in one column. The browser's own checks are off: the
 * screen checks with Zod and passes the reasons (design-spec 4.5).
 */
export function Form({
  density = "regular",
  size,
  onSubmit,
  children,
  ...props
}: FormProps) {
  return (
    <AriaForm
      {...props}
      validationBehavior="aria"
      onSubmit={(event) => {
        // The screen sends the data; the browser must not navigate.
        event.preventDefault();
        onSubmit?.(event);
      }}
      className={styles.form({ density })}
    >
      <SizeContext.Provider
        value={size ?? (density === "spacious" ? "L" : "M")}
      >
        {children}
      </SizeContext.Provider>
    </AriaForm>
  );
}
