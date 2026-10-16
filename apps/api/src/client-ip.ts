import { isIPv6 } from "node:net";

/**
 * The caller's IP (SDD 7.2「呼び出し元の IP」): the rightmost `X-Forwarded-For` value,
 * which Cloud Run's front writes, else the address of the connection. The values to its
 * left are whatever the client sent, so they are never read.
 */
export function callerIp(
  forwardedFor: string | null,
  connectionAddress: string | undefined,
): string | undefined {
  const rightmost = forwardedFor?.split(",").at(-1)?.trim();
  return rightmost === undefined || rightmost === ""
    ? connectionAddress
    : rightmost;
}

/** The eight 16-bit groups of an IPv6 address, a trailing dotted IPv4 part included. */
function ipv6Groups(ip: string): number[] {
  let address = ip.split("%")[0] ?? "";
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
    address = `${address.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [left = "", right] = address.split("::");
  const head = left === "" ? [] : left.split(":");
  const rest = right === undefined || right === "" ? [] : right.split(":");
  const zeros =
    right === undefined ? [] : Array(8 - head.length - rest.length).fill("0");
  return [...head, ...zeros, ...rest].map((group) =>
    Number.parseInt(group, 16),
  );
}

/**
 * What a limit counts an IP as (SDD 7.2「レート制限」), as Better Auth does for its own
 * limits in the same table: an IPv6 address by its /64, the block one line usually
 * holds, so moving to another address inside it does not start a fresh count; an
 * IPv4-mapped address (`::ffff:192.0.2.1`) as its IPv4 address.
 */
export function ipSubject(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const groups = ipv6Groups(ip);
  const [, , , , , mark = 0, high = 0, low = 0] = groups;
  if (groups.slice(0, 5).every((group) => group === 0) && mark === 0xffff) {
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}::/64`;
}
