# @moonx/ui-web

Web の部品（React Aria Components ＋ vanilla-extract。design-spec 4.5）。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成) と [SDD](../../docs/02-01_system-design-doc.md) の ADR-025。

## 中身

- `src/index.ts`: 画面が読み込む入口。読み込むとテーマ（`@moonx/ui-tokens/theme.css`）・ページの土台・書体（`src/styles/`）も入る
- `src/components/`: design-spec 4.5 の部品。見た目は `*.css.ts` に書き、`@moonx/ui-tokens` の `vars`（semantic 層）だけを参照する。React Aria が持つ文言のうち上書きできるものは、`@moonx/i18n` の `components` のカタログから引いて React Aria に渡す（SDD 9章「React Aria の文言」）。引く先は書式関数と同じ共有の i18next のインスタンス（`i18n`）で、描くたびに引く。UI は英語だけで言語を切り替えないので、言語の変更を購読しない
- `src/layout/`: Flex・Stack・Grid・Container。間隔はトークンの名前（`gap="space-300"`）で、幅の段ごとの値（`{ mobile, tablet, desktop }`）も受ける
- `src/internal/`: 部品の中だけで使うもの。`ResponsivePopover` は Picker と DatePicker の、タブレットの幅から上では Popover、下ではトレイになる重ね方（design-spec 4.5）。ほかにフィールドの共通の見た目・ラベルと説明とエラー・キーボードで隠れないようにする処理（4.3）
- `src/preview/`: 開発用の確認のページ（`/dev/components`。docs/03_dev-setup.md 3.3）。英語の文字列を直接持つ（SDD 9章）
- 書体: `src/styles/fonts.ts` が `@fontsource` の CSS を読み込む。woff の予備は `apps/web/vite.config.ts` が外し、woff2 だけを配る（ADR-018）

## テスト

Vitest ＋ Testing Library で書き、部品の操作は `@react-aria/test-utils` も使う（ADR-022）。`packages/` のほかのパッケージが使う Bun test とは別のツールなので、書き方が違う。axe の検査は部品のテストではなく E2E で行う。

- import: `import { expect, test } from "vitest"`（`bun:test` は使えない）
- 置き場所: 対象のファイルの隣に `*.test.tsx`
- 実行: `make test-web`（`apps/web` のテストと一緒に動く）
- 環境: happy-dom。設定は `vitest.config.ts`。幅は `src/test/helpers.ts` の `setPhoneWidth()` で変える（`matchMedia` が幅に合わせて変わる）
- happy-dom で動かない React Aria の操作: ツールバーやボタンのグループで ← を押して前の要素へ移る操作、トレイやダイアログを開いたときの中へのフォーカス（ComboBox のトレイの入力欄、DatePicker のカレンダーの日）とそれに続くキー操作、日付の欄（DatePicker の月・日・年）への入力。これらは `e2e/components.spec.ts`（Chromium）で確かめる。jsdom は `make test-web` が使う Bun の実行環境では起動しない
