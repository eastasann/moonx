/**
 * How long a downloaded file's object URL is kept. Revoked as soon as the click returns,
 * Safari can cancel the download it started; a minute is long past its start.
 */
const KEEP_URL_MS = 60_000;

/** Saves `text` as the file `name` through the browser's download (24's Download). */
export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), KEEP_URL_MS);
}

/**
 * Copies `text` to the clipboard. Rejects where there is none (a page that is not secure)
 * or the browser refuses it.
 */
export const copyText = (text: string) =>
  Promise.resolve().then(() => navigator.clipboard.writeText(text));
