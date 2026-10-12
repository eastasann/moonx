# @moonx/ui-tokens

`docs/06_design-tokens.json` から生成するテーマと、PWA のアイコン・マニフェスト。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)。

## テスト

Bun test で書く（ADR-022）。`apps/web` と `packages/ui-web` の Vitest とは別のツールなので、書き方が違う。

- import: `import { describe, expect, test } from "bun:test"`
- 置き場所: 対象のファイルの隣に `*.test.ts`
- 実行: `make test-domain`（DB は使わない）
