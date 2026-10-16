import { describe, expect, test } from "bun:test";
import { callerIp, ipSubject } from "./client-ip";

describe("callerIp (SDD 7.2「呼び出し元の IP」)", () => {
  test.each([
    ["203.0.113.7", "203.0.113.7"],
    ["10.0.0.1, 203.0.113.7", "203.0.113.7"],
    ["forged, also-forged,203.0.113.7 ", "203.0.113.7"],
    ["2001:db8::1", "2001:db8::1"],
  ])("takes the rightmost value of %p", (header, expected) => {
    expect(callerIp(header, "127.0.0.1")).toBe(expected);
  });

  test.each([[null], [""], ["203.0.113.7, "]])(
    "falls back to the connection when the rightmost value is empty: %p",
    (header) => {
      expect(callerIp(header, "127.0.0.1")).toBe("127.0.0.1");
    },
  );

  test("is undefined with neither", () => {
    expect(callerIp(null, undefined)).toBeUndefined();
  });
});

describe("ipSubject (SDD 7.2「レート制限」)", () => {
  test.each([
    ["203.0.113.7", "203.0.113.7"],
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::9", "2001:db8:1:2::/64"],
    ["2001:DB8:0001:0002:ffff::1", "2001:db8:1:2::/64"],
    ["2001:db8::", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["::ffff:192.0.2.1", "192.0.2.1"],
    ["0:0:0:0:0:ffff:c000:201", "192.0.2.1"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["unknown", "unknown"],
  ])("counts %p as %p", (ip, expected) => {
    expect(ipSubject(ip)).toBe(expected);
  });
});
