// The files src/docs.ts imports as text (`with { type: "text" }`), which Bun inlines
// into the bundle so the image needs no node_modules.

declare module "swagger-ui-dist/swagger-ui.css" {
  const text: string;
  export default text;
}

declare module "swagger-ui-dist/swagger-ui-bundle.js" {
  const text: string;
  export default text;
}
