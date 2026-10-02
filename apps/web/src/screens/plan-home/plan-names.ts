/** "A", "B", ... "Z", "AA", "AB" ... (spreadsheet columns), the suffix of a default plan name. */
function suffix(index: number): string {
  let rest = index;
  let text = "";
  do {
    text = String.fromCharCode(65 + (rest % 26)) + text;
    rest = Math.floor(rest / 26) - 1;
  } while (rest >= 0);
  return text;
}

/**
 * The default name of the next plan: the first of "Plan A", "Plan B", ... that no plan of the idea
 * uses. Archived plans are in `taken` too, because the server counts them (design-spec 6.12, M5).
 * The server compares names without regard to case, so this does as well.
 */
export function nextPlanName(prefix: string, taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  for (let index = 0; ; index += 1) {
    const name = `${prefix} ${suffix(index)}`;
    if (!used.has(name.toLowerCase())) return name;
  }
}
