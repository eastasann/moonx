import { describe, expect, test } from "vitest";
import { attachmentName } from "./files";

describe("attachmentName (RFC 6266)", () => {
  test("the UTF-8 name where there is one, else the plain one", () => {
    expect(
      attachmentName(
        `attachment; filename="Bakery _-five-v1-2026-10-01.pdf"; filename*=UTF-8''Bakery%20%E3%83%91%E3%83%B3-five-v1-2026-10-01.pdf`,
      ),
    ).toBe("Bakery パン-five-v1-2026-10-01.pdf");
    expect(attachmentName(`attachment; filename="Plan A-one-draft.pdf"`)).toBe(
      "Plan A-one-draft.pdf",
    );
  });

  test("a broken escape falls back to the plain name; none named is null", () => {
    expect(
      attachmentName(
        `attachment; filename="Plan.pdf"; filename*=UTF-8''Plan%E3%8.pdf`,
      ),
    ).toBe("Plan.pdf");
    expect(attachmentName("attachment")).toBeNull();
    expect(attachmentName(null)).toBeNull();
  });
});
