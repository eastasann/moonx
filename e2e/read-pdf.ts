import { readFile } from "node:fs/promises";
import { print } from "@moonx/ui-tokens/print";
import { pageText, readPdf } from "../apps/api/src/test-pdf";

// Prints each page of the PDF at the path given as JSON, `{ text, footer }[]`, read as the
// API's tests read the Pitch Deck (pdf.js): the page's text, and that of its footer alone,
// told by the footer's type size. The specs run this with Bun in a process of its own:
// Playwright's loader cannot load pdf.js's module.

const [path] = process.argv.slice(2);
if (path === undefined) {
  throw new Error("Usage: bun e2e/read-pdf.ts <file.pdf>");
}
const pages = await readPdf(await readFile(path));
console.log(
  JSON.stringify(
    pages.map((page) => ({
      text: pageText(page),
      footer: page.texts
        .filter((text) => text.size === print.fontSize.footer)
        .map((text) => text.str)
        .join(" "),
    })),
  ),
);
