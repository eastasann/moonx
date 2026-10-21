import type { Confidence, Fau, FauState } from "@moonx/schemas";
import { confidenceSchema } from "@moonx/schemas";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import * as styles from "./FauButtons.css";
import type { FauChange } from "./FauPicker";
import { MoonGlyphAt } from "./MoonGlyph";
import { SegmentedControl, SegmentedControlItem } from "./SegmentedControl";
import { ToggleButton, ToggleButtonGroup } from "./ToggleButtonGroup";

/** Which of the three buttons a state presses. */
const fauOf = (state: FauState): Fau | null =>
  state === "fact" || state === "fact_no_evidence"
    ? "fact"
    : state === "assumption" || state === "unknown"
      ? state
      : null;

export interface FauButtonsProps {
  /** The answer's state as shown (`Classification.state`, what is being typed included). */
  state: FauState;
  /** Assumption's confidence (`Classification.confidence`). */
  confidence: Confidence | null;
  /** Whether the answer has content: without any, only Unknown can be chosen (6.0.3). */
  hasValue: boolean;
  /**
   * A classification to save: Assumption with its confidence, Unknown, or none when the
   * pressed button is pressed again. A text answer keeps its text as Unknown (6.0.3: it
   * may say what is unknown), so Unknown asks nothing.
   */
  onChange: (change: FauChange) => void;
  /**
   * Fact was pressed: open M2. The answer becomes a Fact only once evidence is attached
   * there; closed without any, it stays as it was (6.0.3).
   */
  onFactPress: () => void;
  /** No choice can be made (offline: the inputs are read only, 6.0.2). */
  isDisabled?: boolean;
  /** Names the buttons: "Fact, Assumption or Unknown for WHO". */
  "aria-label": string;
}

/**
 * The F/A/U of a question's answer, under its field (design-spec 6.0.3「入力欄の下に3つの
 * ボタン」・6.2, s11-form.html .classify): Fact, Assumption and Unknown with their moons,
 * "Not classified yet" beside them while an answer with content has none, and the
 * confidence once Assumption is pressed, which saves nothing until one is chosen.
 * Pressing the chosen button again clears it. A table row's number takes FauPicker.
 */
export function FauButtons({
  state,
  confidence,
  hasValue,
  onChange,
  onFactPress,
  isDisabled = false,
  "aria-label": name,
}: FauButtonsProps) {
  const { t } = useTranslation(["components", "common"]);
  const current = fauOf(state);
  const confidenceId = useId();
  // Assumption pressed but no confidence chosen yet: nothing is saved until one is.
  const [pending, setPending] = useState(false);
  const shown = pending ? "assumption" : current;

  const change = (next: FauChange) => {
    setPending(false);
    onChange(next);
  };
  const press = (pressed: Fau | null) => {
    if (pressed === null) {
      if (pending) setPending(false);
      else change({ fau: null, confidence: null });
    } else if (pressed === "fact") {
      setPending(false);
      onFactPress();
    } else if (pressed === "assumption") {
      setPending(true);
    } else {
      change({ fau: "unknown", confidence: null });
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <ToggleButtonGroup
          aria-label={name}
          isDisabled={isDisabled}
          selectedKeys={shown === null ? [] : [shown]}
          onSelectionChange={(keys) => {
            const [key] = keys;
            press(key === undefined ? null : (String(key) as Fau));
          }}
        >
          <ToggleButton id="fact" isDisabled={!hasValue && current !== "fact"}>
            <span className={styles.toggleGlyph}>
              <MoonGlyphAt state="fact" size="M" />
            </span>
            {t("common:fau.fact")}
          </ToggleButton>
          <ToggleButton
            id="assumption"
            isDisabled={!hasValue && current !== "assumption"}
          >
            <span className={styles.toggleGlyph}>
              <MoonGlyphAt state="assumption" size="M" />
            </span>
            {t("common:fau.assumption")}
          </ToggleButton>
          <ToggleButton id="unknown">
            <span className={styles.toggleGlyph}>
              <MoonGlyphAt state="unknown" size="M" />
            </span>
            {t("common:fau.unknown")}
          </ToggleButton>
        </ToggleButtonGroup>
        {state === "unclassified" && !pending && (
          <span className={styles.note}>
            {t("components:fauButtons.notClassified")}
          </span>
        )}
      </div>
      {shown === "assumption" && (
        <div className={styles.group}>
          <p id={confidenceId} className={styles.groupLabel}>
            {t("components:fauPicker.confidence")}
          </p>
          <SegmentedControl
            aria-labelledby={confidenceId}
            isDisabled={isDisabled}
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
    </div>
  );
}
