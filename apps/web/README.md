# @moonx/web

TanStack Start（SPA モード）の Web。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)、画面にスタイルと生の文字列を書かない決まりは [SDD](../../docs/02-01_system-design-doc.md) の ADR-025 と SDD 9章。

## テスト

Vitest ＋ Testing Library で書く（ADR-022）。`apps/api` と `packages/` の多くが使う Bun test とは別のツールなので、書き方が違う。

- import: `import { expect, test } from "vitest"`（`bun:test` は使えない）
- 置き場所: 対象のファイルの隣に `*.test.tsx`。`src/routes/` に置いてもルートにならない（`vite.config.ts` の `routeFileIgnorePattern`）
- 実行: `make test-web`（`packages/ui-web` のテストと一緒に動く）
- 環境: happy-dom。設定は `vitest.config.ts` で、TanStack Start のプラグインは入れない
- ルートの描画: `routeTree` から `createRouter` と `createMemoryHistory` で組み立てる。ルートのルートは `<html>` を描くので、`render(…, { container: document })` で描く

## 生成物

`src/routeTree.gen.ts` は TanStack Router の Vite プラグインが、`make dev-web`・`make build-web` のたびに `src/routes/` から作り直す。手で直さず、ルートを足したら作り直したものをコミットする。
