import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SECRET_LINE = /^BETTER_AUTH_SECRET=(.*)$/gm;

/**
 * The value a `.env` line's right-hand side stands for, read the way the Makefile and
 * Bun read it: the text inside one pair of quotes, otherwise everything before a `#`
 * comment, trimmed.
 */
export function envValue(raw: string): string {
  const quoted = raw.match(/^\s*(["'])(.*?)\1/);
  if (quoted !== null) return quoted[2] ?? "";
  return raw.replace(/#.*$/, "").trim();
}

/** 32 random bytes in base64, the same shape as `openssl rand -base64 32`. */
export function randomSecret(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
    "base64",
  );
}

/**
 * Creates `.env` from `.env.example` unless it already exists, then fills
 * `BETTER_AUTH_SECRET` if it is empty. An existing `.env` is otherwise left untouched,
 * so rerunning `make setup` never discards local edits or rotates the secret.
 *
 * @returns what changed, for the setup log.
 */
export function ensureEnvFile(
  rootDir: string,
  makeSecret: () => string = randomSecret,
): { created: boolean; secretFilled: boolean } {
  const envPath = join(rootDir, ".env");
  const created = !existsSync(envPath);
  if (created) copyFileSync(join(rootDir, ".env.example"), envPath);

  const content = readFileSync(envPath, "utf8");
  // The last line wins, as in the Makefile and Bun.
  const match = [...content.matchAll(SECRET_LINE)].at(-1);
  if (match !== undefined && envValue(match[1] ?? "").trim() !== "")
    return { created, secretFilled: false };

  const line = `BETTER_AUTH_SECRET=${makeSecret()}`;
  const updated =
    match === undefined
      ? `${content}${content === "" || content.endsWith("\n") ? "" : "\n"}${line}\n`
      : content.slice(0, match.index) +
        line +
        content.slice(match.index + match[0].length);
  writeFileSync(envPath, updated);
  return { created, secretFilled: true };
}

if (import.meta.main) {
  const { created, secretFilled } = ensureEnvFile(process.cwd());
  console.log(
    [
      created ? "Created .env from .env.example" : ".env already exists",
      secretFilled ? "filled BETTER_AUTH_SECRET" : "kept BETTER_AUTH_SECRET",
    ].join("; "),
  );
}
