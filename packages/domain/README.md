# @moonx/domain

計算・確認項目・F/A/U・工程・Pitch Deck の組み立て・AI 書き出し / 取り込みの書式（純粋関数）。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)。

## テスト

Bun test で書く（ADR-022）。`apps/web` と `packages/ui-web` の Vitest とは別のツールなので、書き方が違う。

- import: `import { describe, expect, test } from "bun:test"`
- 置き場所: 対象のファイルの隣に `*.test.ts`
- 実行: `make test-domain`（DB は使わない）
