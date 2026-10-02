/** What a NumberField's text means while it is being typed. */
export type NumberReading =
  | { kind: "empty" }
  /** A sign or a decimal point with no digits yet: the person is still typing, nothing changes. */
  | { kind: "partial" }
  | { kind: "value"; value: number };

/**
 * Reads the text of a NumberField on every keystroke, since the field itself reports a number only
 * when it is committed. Thousands commas, a currency symbol and a percent sign are ignored, so
 * `₱1,234.5` reads as 1234.5. A negative number is a value; the caller's range check rejects it.
 */
export function readNumberText(text: string): NumberReading {
  // Stripping the letters would turn a pasted `1e5` into 15, a different number.
  if (/\d[eE][+-]?\d/.test(text)) return { kind: "partial" };
  const cleaned = text.replace(/[^\d.\-−]/g, "").replace("−", "-");
  if (cleaned === "") return { kind: "empty" };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return { kind: "partial" };
  return { kind: "value", value: Number(cleaned) };
}

/** Like {@link readNumberText} for a percent field: `35` and `35%` both read as the fraction 0.35. */
export function readPercentText(text: string): NumberReading {
  const reading = readNumberText(text);
  // 33.3 / 100 is 0.33299999999999996; rounding to 15 significant digits gives the 0.333 typed.
  return reading.kind === "value"
    ? { kind: "value", value: Number((reading.value / 100).toPrecision(15)) }
    : reading;
}
