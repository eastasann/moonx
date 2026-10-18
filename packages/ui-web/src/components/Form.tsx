import type { ScreenDensity, Size } from "@moonx/ui-tokens";
import { type FormEvent, type ReactNode, useContext } from "react";
import { Form as AriaForm } from "react-aria-components";
import { Density, DensityContext } from "../internal/Density";
import { SizeContext } from "../internal/size";
import * as styles from "./Form.css";

export interface FormProps {
  /**
   * The screen's density (design-spec 4.4): spacing between the fields, and their size
   * (regular M, spacious L, as 06 semantic.density says). Without it, the density of the
   * pattern or the dialog around (regular outside them).
   */
  density?: ScreenDensity;
  /** The size of the fields, Buttons and choices inside, in place of the density's. */
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
  density: givenDensity,
  size,
  onSubmit,
  children,
  ...props
}: FormProps) {
  const around = useContext(DensityContext);
  const density = givenDensity ?? around;
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
      <Density density={density}>
        {size === undefined ? (
          children
        ) : (
          <SizeContext.Provider value={size}>{children}</SizeContext.Provider>
        )}
      </Density>
    </AriaForm>
  );
}
