// Self-hosted typefaces (ADR-018): the weights of 06 primitive.font.weight only, in every
// family of primitive.font.family.sans and .mono that is served. The Japanese face stays
// split by unicode-range, so a browser fetches only the files for the characters on
// screen. apps/web's Vite config drops the woff fallbacks these files also list, so the
// build ships woff2 only. fonts.test.ts checks the weights against 06.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans-jp/400.css";
import "@fontsource/ibm-plex-sans-jp/500.css";
import "@fontsource/ibm-plex-sans-jp/600.css";
