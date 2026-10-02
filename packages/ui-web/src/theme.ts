/**
 * Importing this module applies the generated theme (light / dark, medium / large) to `:root`.
 * Components read tokens only through `vars`, and only from the semantic layer (ADR-018).
 */
import "@moonx/ui-tokens/web";

export { breakpoints, vars } from "@moonx/ui-tokens/web";
