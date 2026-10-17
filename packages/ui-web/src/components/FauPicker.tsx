import { i18n } from "@moonx/i18n";
import type { Confidence, Fau, FauState } from "@moonx/schemas";
import { confidenceSchema } from "@moonx/schemas";
import type { Size } from "@moonx/ui-tokens";
import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import type { MoonState } from "../internal/MoonMark";
import * as moonStyles from "../internal/moon.css";
import { useIsNarrow } from "../internal/useIsNarrow";
import { actionButton } from "./ActionButton.css";
import { AlertDialog, DialogTrigger } from "./Dialog";
import * as styles from "./FauPicker.css";
import { MoonGlyphAt } from "./MoonGlyph";
import { Popover } from "./Popover";
import { SegmentedControl, SegmentedControlItem } from "./SegmentedControl";
import { ToggleButton, ToggleButtonGroup } from "./ToggleButtonGroup";

/** The mark of each F/A/U state: a Fact without evidence is still a full moon (6.0.3). */
const moonOf = {
  fact: "fact",
  fact_no_evidence: "fact",
  assumption: "assumption",
  unknown: "unknown",
  unclassified: "unclassified",
  empty: "empty",
} as const satisfies Record<FauState, MoonState>;

/** Which of the three buttons a state presses. */
const fauOf = (state: FauState): Fau | null =>
  state === "fact" || state === "fact_no_evidence"
    ? "fact"
    : state === "assumption" || state === "unknown"
      ? state
      : null;

export interface FauLabelOptions {
  /** Named after Assumption ("Assumption · Medium"); ignored for the other states. */
  confidence?: Confidence | null;
  /** A Fact's evidence that counts (research logs not deleted, URLs). */
  evidenceCount?: number;
}

/**
 * A state's label as design-spec 6.0.3 writes it: "Fact · 2 sources", "Fact · No evidence",
 * "Assumption · Medium", "Unknown", "Unclassified", "Empty". For a StatusLight beside an
 * answer as much as for FauPicker.
 */
export function fauLabel(
  state: FauState,
  { confidence = null, evidenceCount = 0 }: FauLabelOptions = {},
): string {
  if (state === "fact") {
    return i18n.t("common:fauLabel.fact", { count: evidenceCount });
  }
  if (state === "assumption" && confidence !== null) {
    return i18n.t("common:fauLabel.assumption", {
      confidence: i18n.t(`common:confidence.${confidence}`),
    });
  }
  return i18n.t(`common:fauState.${state}`);
}

/** What FauPicker reports: the classification to save (`ClassificationInput`). */
export interface FauChange {
  fau: Fau | null;
  confidence: Confidence | null;
}

export interface FauPickerProps {
  /** The number's state as the API derived it (`Classification.state`). */
  state: FauState;
  /** Assumption's confidence (`Classification.confidence`). */
  confidence: Confidence | null;
  /** A Fact's evidence that counts, for "Fact · 2 sources". @default 0 */
  evidenceCount?: number;
  /** Whether the number has a value: without one only Unknown can be chosen (6.0.3). */
  hasValue: boolean;
  /**
   * A classification to save: Assumption with its confidence, Unknown (the API then clears
   * the value, SDD 5.7 V14), or none when a pressed button is pressed again.
   */
  onChange: (change: FauChange) => void;
  /**
   * Fact was chosen: open M2. The number becomes a Fact only once evidence is attached
   * there; closed without any, it stays as it was (6.0.3).
   */
  onFactPress: () => void;
  /** Shows the state alone, for a Viewer or an archived idea. */
  isReadOnly?: boolean;
  /** @default "M" */
  size?: Size;
  /** The number it classifies ("Rent"): names the button and the choices. */
  "aria-label": string;
}

/**
 * The F/A/U cell of 17's and 18's table rows (design-spec 4.5・6.0.3): the state as its
 * moon and label; pressing it opens a popover with Fact / Assumption / Unknown and the
 * confidence. On a phone the row is edited in a sheet, so the buttons sit in it directly.
 */
export function FauPicker({
  isReadOnly = false,
  size = "M",
  ...props
}: FauPickerProps) {
  const isNarrow = useIsNarrow();
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Closed, the popover gives focus back to its button (design-spec 4.5). In a table,
  // React Aria's grid sends focus that comes back to it to a cell instead (the one it
  // remembers), so the button takes it from there: the next time focus comes back to the
  // button's collection. Focus a dialog takes first (M2, opened by Fact; the Unknown
  // question) waits for that dialog to give it back. Focus or a press anywhere else on
  // the page ends the wait, as does the picker going away.
  const stopWaiting = useRef<(() => void) | null>(null);
  useEffect(() => () => stopWaiting.current?.(), []);
  const close = () => {
    setOpen(false);
    stopWaiting.current?.();
    const trigger = triggerRef.current;
    const collection = trigger?.closest('[role="grid"], [role="treegrid"]');
    const inDialog = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('[role="dialog"], [role="alertdialog"]') !== null;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (inDialog(target)) return;
      stop();
      if (
        trigger?.isConnected &&
        target instanceof Element &&
        target !== trigger &&
        (target.contains(trigger) || collection?.contains(target))
      ) {
        trigger.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!inDialog(event.target)) stop();
    };
    const stop = () => {
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      stopWaiting.current = null;
    };
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    stopWaiting.current = stop;
  };
  const label = fauLabel(props.state, props);
  const summary = (
    <span className={styles.summary}>
      <MoonGlyphAt state={moonOf[props.state]} size={size} />
      <span className={moonStyles.labelColor[moonOf[props.state]]}>
        {label}
      </span>
      {props.state === "fact_no_evidence" && (
        <span className={styles.warning}>
          <IconSlot size={size}>
            <TriangleAlert />
          </IconSlot>
        </span>
      )}
    </span>
  );

  if (isReadOnly) {
    return <span className={styles.readOnly[size]}>{summary}</span>;
  }
  if (isNarrow) {
    return (
      <fieldset aria-label={props["aria-label"]} className={styles.inline}>
        <span className={styles.readOnly[size]}>{summary}</span>
        <FauControls {...props} size={size} />
      </fieldset>
    );
  }
  return (
    <DialogTrigger
      isOpen={isOpen}
      onOpenChange={(open) => (open ? setOpen(true) : close())}
    >
      <Button
        ref={triggerRef}
        // A press focuses the button where the browser does not (Safari), so the popover
        // has a button to give focus back to.
        onPressStart={() => triggerRef.current?.focus()}
        aria-label={i18n.t("components:fauPicker.trigger", {
          name: props["aria-label"],
          state: label,
        })}
        className={`${actionButton({ size, isQuiet: true, iconOnly: false })} ${styles.trigger}`}
      >
        {summary}
      </Button>
      <Popover aria-label={props["aria-label"]}>
        <FauControls {...props} size={size} onDone={close} />
      </Popover>
    </DialogTrigger>
  );
}

/**
 * The three buttons and the confidence, with 6.0.3's rules: pressing a chosen button
 * again clears it; Assumption waits for a confidence; Unknown on a number with a value
 * asks first, as it clears the value.
 */
function FauControls({
  state,
  confidence,
  hasValue,
  onChange,
  onFactPress,
  size,
  onDone,
  "aria-label": name,
}: Omit<FauPickerProps, "isReadOnly" | "size"> & {
  size: Size;
  /** The choice is made: the popover closes. */
  onDone?: () => void;
}) {
  const current = fauOf(state);
  // Assumption pressed but no confidence chosen yet: nothing is saved until one is.
  const [pending, setPending] = useState(false);
  const [isAsking, setAsking] = useState(false);
  const shown = pending ? "assumption" : current;

  const change = (next: FauChange) => {
    setPending(false);
    onChange(next);
    onDone?.();
  };
  const press = (pressed: Fau | null) => {
    if (pressed === null) {
      // The pressed button was pressed again.
      if (pending) setPending(false);
      else change({ fau: null, confidence: null });
      return;
    }
    if (pressed === "fact") {
      setPending(false);
      onDone?.();
      onFactPress();
    } else if (pressed === "assumption") {
      setPending(true);
    } else if (hasValue) {
      setAsking(true);
    } else {
      change({ fau: "unknown", confidence: null });
    }
  };

  return (
    <div className={styles.controls}>
      <ToggleButtonGroup
        aria-label={name}
        size={size}
        isJustified
        selectedKeys={shown === null ? [] : [shown]}
        onSelectionChange={(keys) => {
          const [key] = keys;
          press(key === undefined ? null : (String(key) as Fau));
        }}
      >
        <ToggleButton id="fact" isDisabled={!hasValue && current !== "fact"}>
          <span className={styles.toggleGlyph}>
            <MoonGlyphAt state="fact" size={size} />
          </span>
          {i18n.t("common:fau.fact")}
        </ToggleButton>
        <ToggleButton
          id="assumption"
          isDisabled={!hasValue && current !== "assumption"}
        >
          <span className={styles.toggleGlyph}>
            <MoonGlyphAt state="assumption" size={size} />
          </span>
          {i18n.t("common:fau.assumption")}
        </ToggleButton>
        <ToggleButton id="unknown">
          <span className={styles.toggleGlyph}>
            <MoonGlyphAt state="unknown" size={size} />
          </span>
          {i18n.t("common:fau.unknown")}
        </ToggleButton>
      </ToggleButtonGroup>
      {shown === "assumption" && (
        <SegmentedControl
          aria-label={i18n.t("components:fauPicker.confidence")}
          size={size}
          isJustified
          selectedKey={pending ? null : confidence}
          onSelectionChange={(key) =>
            change({
              fau: "assumption",
              confidence: confidenceSchema.parse(key),
            })
          }
        >
          {confidenceSchema.options.map((option) => (
            <SegmentedControlItem key={option} id={option}>
              {i18n.t(`common:confidence.${option}`)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      )}
      <AlertDialog
        isOpen={isAsking}
        onOpenChange={setAsking}
        title={i18n.t("components:fauPicker.unknownTitle")}
        primaryActionLabel={i18n.t("components:fauPicker.markUnknown")}
        cancelLabel={i18n.t("components:fauPicker.cancel")}
        onPrimaryAction={() => change({ fau: "unknown", confidence: null })}
        autoFocusButton="cancel"
      >
        {i18n.t("components:fauPicker.unknownBody")}
      </AlertDialog>
    </div>
  );
}
