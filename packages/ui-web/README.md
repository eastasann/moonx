# @moonx/ui-web

Web の部品（React Aria Components ＋ vanilla-extract。design-spec 4.5）。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成) と [SDD](../../docs/02-01_system-design-doc.md) の ADR-025。

## テスト

Vitest ＋ Testing Library で書き、部品の操作は `@react-aria/test-utils` も使う（ADR-022）。`packages/` のほかのパッケージが使う Bun test とは別のツールなので、書き方が違う。axe の検査は部品のテストではなく E2E で行う。

- import: `import { expect, test } from "vitest"`（`bun:test` は使えない）
- 置き場所: 対象のファイルの隣に `*.test.tsx`
- 実行: `make test-web`（`apps/web` のテストと一緒に動く）
- 環境: happy-dom。設定は `vitest.config.ts`
