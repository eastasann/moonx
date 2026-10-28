/**
 * How long a downloaded file's object URL is kept. Revoked as soon as the click returns,
 * Safari can cancel the download it started; a minute is long past its start.
 */
const KEEP_URL_MS = 60_000;

/** Saves `blob` as the file `name` through the browser's download (23's PDF). */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), KEEP_URL_MS);
}

/** Saves `text` as the file `name` through the browser's download (24's Download). */
export function downloadText(name: string, text: string, type: string) {
  downloadBlob(name, new Blob([text], { type }));
}

/**
 * The file name a `Content-Disposition` gives (RFC 6266): its UTF-8 `filename*` where
 * there is one, else its `filename`; null when it names none.
 */
export function attachmentName(disposition: string | null): string | null {
  if (disposition === null) return null;
  const extended = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(disposition);
  if (extended?.[1] !== undefined) {
    try {
      return decodeURIComponent(extended[1]);
    } catch {
      // A broken escape: the ASCII name below still names the file.
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/i.exec(disposition);
  return plain?.[1] ?? null;
}

/**
 * Copies `text` to the clipboard. Rejects where there is none (a page that is not secure)
 * or the browser refuses it.
 */
export const copyText = (text: string) =>
  Promise.resolve().then(() => navigator.clipboard.writeText(text));

/**
 * Reads a chosen file as UTF-8 (25's reply, 26's template file). Null when it is not
 * UTF-8; a byte order mark is dropped.
 */
export async function readUtf8(file: File): Promise<string | null> {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      await file.arrayBuffer(),
    );
  } catch {
    return null;
  }
}
