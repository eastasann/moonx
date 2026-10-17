import type { Confidence, Fau, FauState } from "@moonx/schemas";
import { confidenceSchema } from "@moonx/schemas";
import type { Size } from "@moonx/ui-tokens";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { IconSlot } from "../internal/IconSlot";
import type { MoonState } from "../internal/MoonMark";
import * as moonStyles from "../internal/moon.css";
import { useTableCell } from "../internal/tableCell";
import { useFocusBackToTrigger } from "../internal/useFocusBackToTrigger";
import { useIsNarrow } from "../internal/useIsNarrow";
import { AlertDialog, DialogTrigger } from "./Dialog";
import * as styles from "./FauPicker.css";
import { Link } from "./Link";
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
 * Labels a state as design-spec 6.0.3 writes it: "Fact · 2 sources", "Fact · No evidence",
 * "Assumption · Medium", "Unknown", "Unclassified", "Empty". For a StatusLight beside an
 * answer as much as for FauPicker.
 */
export function useFauLabel(): (
  state: FauState,
  options?: FauLabelOptions,
) => string {
  const { t } = useTranslation(["components", "common"]);
  return (state, { confidence = null, evidenceCount = 0 } = {}) => {
    if (state === "fact") {
      return t("common:fauLabel.fact", { count: evidenceCount });
    }
    if (state === "assumption" && confidence !== null) {
      return t("common:fauLabel.assumption", {
        confidence: t(`common:confidence.${confidence}`),
      });
    }
    return t(`common:fauState.${state}`);
  };
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
  /**
   * The size of the buttons and the confidence in the phone's sheet; the popover's are
   * s17-costs.html's whatever the size (design-spec 4.5). @default "M"
   */
  size?: Size;
  /** The number it classifies ("Rent"): names the button and the choices. */
  "aria-label": string;
}

/**
 * The F/A/U cell of 17's and 18's table rows (design-spec 4.5・6.0.3): the state's label
 * (the row's mark sits in its own column at the start of the row), and ▾ once the row is
 * edited; pressing it opens a popover with Fact / Assumption / Unknown and the
 * confidence. On a phone the row is edited in a sheet, so the buttons sit in it directly,
 * under the state with its moon. Outside a table the state also shows its moon. A table
 * that holds one gives its rows a mark column (`isMark`) with the state's MoonGlyph.
 */
export function FauPicker({
  isReadOnly = false,
  size = "M",
  ...props
}: FauPickerProps) {
  const { t } = useTranslation(["components", "common"]);
  const isNarrow = useIsNarrow();
  const cell = useTableCell();
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusBack = useFocusBackToTrigger(triggerRef);
  const close = () => {
    setOpen(false);
    focusBack();
  };
  const fauLabel = useFauLabel();
  const label = fauLabel(props.state, props);
  const state = moonOf[props.state];
  const summary = (withMoon: boolean) => (
    <span className={styles.summary}>
      {withMoon && <MoonGlyphAt state={state} size={size} />}
      <span
        className={
          cell === null ? moonStyles.labelColor[state] : styles.cellLabel[state]
        }
      >
        {label}
      </span>
      {props.state === "fact_no_evidence" && (
        <span className={styles.warning}>
          <IconSlot size="XS">
            <TriangleAlert />
          </IconSlot>
        </span>
      )}
    </span>
  );

  if (isReadOnly) {
    return <span className={styles.readOnly}>{summary(cell === null)}</span>;
  }
  if (isNarrow) {
    return (
      <fieldset aria-label={props["aria-label"]} className={styles.inline}>
        <span className={styles.readOnly}>{summary(true)}</span>
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
        aria-label={t("components:fauPicker.trigger", {
          name: props["aria-label"],
          state: label,
        })}
        className={styles.trigger}
      >
        {summary(cell === null)}
        {cell?.isEditing && (
          <IconSlot size="XS">
            <ChevronDown />
          </IconSlot>
        )}
      </Button>
      <Popover aria-label={props["aria-label"]}>
        <div className={styles.popoverBody}>
          {/* s17's grooves (FauPicker.css) whatever the size; S moons fit them. */}
          <FauControls {...props} size="M" glyphSize="S" onDone={close} />
        </div>
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
  state: fauState,
  confidence,
  hasValue,
  onChange,
  onFactPress,
  size,
  glyphSize = size,
  onDone,
  "aria-label": name,
}: Omit<FauPickerProps, "isReadOnly" | "size"> & {
  size: Size;
  /** The buttons' moons: S in the popover (s17-costs.html), the size's own in the sheet. */
  glyphSize?: Size;
  /** The choice is made: the popover closes. */
  onDone?: () => void;
}) {
  const { t } = useTranslation(["components", "common"]);
  const current = fauOf(fauState);
  const state = moonOf[fauState];
  const confidenceId = useId();
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

  const isFact = state === "fact";
  const addEvidence = () => {
    setPending(false);
    onDone?.();
    onFactPress();
  };

  return (
    <div className={styles.controls}>
      <div className={styles.group}>
        <p className={styles.groupLabel}>
          {t("components:fauPicker.question")}
        </p>
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
              <MoonGlyphAt state="fact" size={glyphSize} />
            </span>
            {t("common:fau.fact")}
          </ToggleButton>
          <ToggleButton
            id="assumption"
            isDisabled={!hasValue && current !== "assumption"}
          >
            <span className={styles.toggleGlyph}>
              <MoonGlyphAt state="assumption" size={glyphSize} />
            </span>
            {t("common:fau.assumption")}
          </ToggleButton>
          <ToggleButton id="unknown">
            <span className={styles.toggleGlyph}>
              <MoonGlyphAt state="unknown" size={glyphSize} />
            </span>
            {t("common:fau.unknown")}
          </ToggleButton>
        </ToggleButtonGroup>
      </div>
      {shown === "assumption" && (
        <div className={styles.group}>
          <p id={confidenceId} className={styles.groupLabel}>
            {t("components:fauPicker.confidence")}
          </p>
          <SegmentedControl
            aria-labelledby={confidenceId}
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
                {t(`common:confidence.${option}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
      )}
      {hasValue && (
        // Evidence makes a number a Fact (6.0.3): the way to M2, also for a Fact that lost it.
        <div className={styles.evidence}>
          {!isFact && <span>{t("components:fauPicker.evidenceHint")}</span>}
          <Link onPress={addEvidence}>
            {t("components:fauPicker.addEvidence")}
          </Link>
        </div>
      )}
      <AlertDialog
        isOpen={isAsking}
        onOpenChange={setAsking}
        title={t("components:fauPicker.unknownTitle")}
        primaryActionLabel={t("components:fauPicker.markUnknown")}
        cancelLabel={t("components:fauPicker.cancel")}
        onPrimaryAction={() => change({ fau: "unknown", confidence: null })}
        autoFocusButton="cancel"
      >
        {t("components:fauPicker.unknownBody")}
      </AlertDialog>
    </div>
  );
}
