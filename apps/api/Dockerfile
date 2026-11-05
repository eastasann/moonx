# The one image of ADR-004 and ADR-016: the API's bundle and the Web's build, both made
# by make build-api-image before this runs, so the files Sentry gets the source maps of
# are the files in the image. Built from the repository root (.dockerignore).

# Bun is package.json's packageManager, which CI and the tests run (scripts/
# image-versions.test.ts holds the two together); the digest pins the image of that tag.
FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61 AS dependencies
WORKDIR /app
# The frozen lockfile is checked against every workspace, so every manifest comes in.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/i18n/package.json packages/i18n/
COPY packages/schemas/package.json packages/schemas/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY packages/ui-web/package.json packages/ui-web/
# What the bundle loads from node_modules at run time: the packages make build-api-image
# leaves out of it (sharp with its native binary for this platform, react-pdf and React;
# the Makefile says why) and the PDF's font files (ADR-012). The peers Bun would add
# (TypeScript, a DOM for tests) are not needed.
RUN bun install --frozen-lockfile --production --omit=peer --filter=@moonx/api

FROM oven/bun:1.4.2-slim@sha256:cb3bbbb08e13a4a2ff400f24c7a2a1d5efa83f6ef8544d52d95a519631e2fc61
WORKDIR /app
COPY --from=dependencies /app/node_modules node_modules
COPY --from=dependencies /app/apps/api/node_modules apps/api/node_modules
COPY apps/api/dist apps/api/dist
COPY apps/web/dist/client web
ARG APP_VERSION
# SDD 2章「環境変数」: the rest comes from Cloud Run (PORT) and Terraform. NODE_ENV is
# production, as for the API that the E2E tests of the built Web run against
# (e2e/playwright.config.ts), so those tests take the libraries' production branches.
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION} \
    WEB_DIST_DIR=/app/web
USER bun
CMD ["bun", "apps/api/dist/index.js"]
