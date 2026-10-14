# @moonx/ui-tokens

`docs/06_design-tokens.json` から生成するテーマと、PWA のアイコン・マニフェスト。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)。

## 中身

- `src/generated/`: `make tokens` の生成物。手で直さない（ADR-025）。06 か `scripts/` を直して `make tokens` で作り直し、一緒にコミットする（差分が残ると CI が失敗する。ADR-018）
  - `vars.ts`: `vars`（semantic 層の CSS 変数。`semantic.color.light.surface.canvas` は `vars.color.surface.canvas` = `var(--color-surface-canvas)`。ライト / ダークと medium / large で名前は同じ）と `breakpoints`（px の数。CSS 変数を読めないメディアクエリ用）
  - `theme.css.ts`: 値の割り当て。Web は `@moonx/ui-tokens/theme.css` を1回 import する。切り替えは `<html data-theme="light|dark">`（無ければ OS）と `<html data-scale="medium|large">`（無ければ `pointer: coarse` で large）
  - `print.ts`: `print`（react-pdf 用の `semantic.print`。常にライト。大きさは pt の数）。画面のスライドは `vars.print` を使う（文字の大きさも px。06 の `primitive.font.size`）
  - `pwa/`: `manifest.webmanifest` とアイコン（SVG と PNG。ADR-031）
- `src/types.ts`: 部品の props が使う値の型（`Size`・`Space` など）。手で書く。06 と食い違うと `types.test.ts` が失敗する
- `scripts/`: `make tokens` の本体（`generate.ts`）と検査。06 の参照・循環・semantic がエイリアスだけであること（`tokens.ts`）と、意味色のコントラスト（`contrast.ts`）を確かめ、通らなければ何も書かない。06 に色を足したら、`contrast.ts` で、前景として組に足すか、下地だけの色の一覧か対象外の一覧に足す（どれにも無いと失敗する）

## テスト

Bun test で書く（ADR-022）。`apps/web` と `packages/ui-web` の Vitest とは別のツールなので、書き方が違う。

- import: `import { describe, expect, test } from "bun:test"`
- 置き場所: 対象のファイルの隣に `*.test.ts`
- 実行: `make test-domain`（DB は使わない）。`src/generated/` が 06 から作ったものと同じか、`theme.css.ts` が vanilla-extract でコンパイルできるかも確かめる
