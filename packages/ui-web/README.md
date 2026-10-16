# @moonx/ui-web

Web の部品（React Aria Components ＋ vanilla-extract。design-spec 4.5）。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成) と [SDD](../../docs/02-01_system-design-doc.md) の ADR-025。

## 中身

- `src/index.ts`: 画面が読み込む入口。読み込むとテーマ（`@moonx/ui-tokens/theme.css`）・ページの土台・書体（`src/styles/`）も入る
- `src/components/`: design-spec 4.5 の部品。見た目は `*.css.ts` に書き、`@moonx/ui-tokens` の `vars`（semantic 層）だけを参照する。React Aria が持つ文言のうち上書きできるものは、`@moonx/i18n` の `components` のカタログから引いて React Aria に渡す（SDD 9章「React Aria の文言」）。引く先は書式関数と同じ共有の i18next のインスタンス（`i18n`）で、描くたびに引く。UI は英語だけで言語を切り替えないので、言語の変更を購読しない
- `src/layout/`: Flex・Stack・Grid・Container。間隔はトークンの名前（`gap="space-300"`）で、幅の段ごとの値（`{ mobile, tablet, desktop }`）も受ける
- `src/patterns/`: レイアウトのパターン A〜J の枠（design-spec 4.1）。画面は中身を props（`header`・`blocks`・`list`・`detail` など）で渡し、3つの幅の並びはパターンが決める。主要な操作（`primaryAction`）は、タブレットの幅から上では見出しの横か内容の後、スマホでは下部に固定する（4.3。`PageHeader.tsx`）。密度は 4.4「密度とスケールの対応」のとおりパターンごとに決まる（A・D・E・F・I は regular、B・C・G・H・J は spacious）。幅で並べ替える所は、画面の見た目の順と文書の順（読み上げと Tab の順）をそろえる
- アプリの枠: `components/` の AppFrame・SideNav・TabBar・PageFrame・RouterProvider（design-spec 4.5・6.0.1）。ページ全体がスクロールし、ヘッダー・サイドバー・TabBar は画面に留まる。AppFrame はヘッダーの高さとスマホの TabBar の高さを CSS 変数（`internal/frame.css.ts`）で中のパターンに渡し、パターンの下部に固定する操作（`internal/frame.tsx` の `BottomBar`・`FloatingAction`）は TabBar の上、キーボードが出ているときはその上に付く。AppFrame の外（PageFrame・確認用ページ）では、どちらも 0 になる。フォーカスで画面に入る入力欄がヘッダーと下の固定の操作に隠れないよう、`html` の `scroll-padding` も同じ高さにする
- `src/internal/`: 部品の中だけで使うもの。`ResponsivePopover` は Popover・Menu・Picker・DatePicker・ContextualHelp の、タブレットの幅から上では Popover、下ではトレイになる重ね方（design-spec 4.5）。トレイの枠は `components/Tray.tsx` の `TraySheet`（公開する `Tray` はそれに dialog を足したもの）。`MoonMark` は月の印（4.4「状態の形」）のただ1つの描き方で、MoonGlyph と StatusLight が使う。`diff.ts` は DiffText の文字単位の差分、`slideUnits.ts` は Slide の寸法（06 `semantic.print`）をスライドの幅に対する割合にする関数、`scrollToFocusAnchor.ts` は QuestionCard を 06 `layout.focus-anchor` の高さへ送るスクロール。`frame.tsx` は AppFrame とパターンの受け渡し（ヘッダーにパターンの道具（11 の Focus のスイッチ）を置く場所、スマホでヘッダーの ← を一覧へ戻す ListDetailPattern の上書き）と、`BottomBar`・`FloatingAction`・画面上部の帯（`Banners`。オフラインを先に並べる）、`NavBadge.tsx` は SideNav と TabBar の未読数。ほかにフィールドの共通の見た目・ラベルと説明とエラー・キーボードで隠れないようにする処理（4.3）・TextArea と MentionTextArea が入力に合わせて広がる処理・幅の段の判定（`useIsNarrow`・`useIsDesktop`）
- `src/preview/`: 開発用の確認のページ（`/dev/components`。docs/03_dev-setup.md 3.3）。英語の文字列を直接持つ（SDD 9章）
- 書体: `src/styles/fonts.ts` が `@fontsource` の CSS を読み込む。woff の予備は `apps/web/vite.config.ts` が外し、woff2 だけを配る（ADR-018）

## テスト

Vitest ＋ Testing Library で書き、部品の操作は `@react-aria/test-utils` も使う（ADR-022）。`packages/` のほかのパッケージが使う Bun test とは別のツールなので、書き方が違う。axe の検査は部品のテストではなく E2E で行う。

- import: `import { expect, test } from "vitest"`（`bun:test` は使えない）
- 置き場所: 対象のファイルの隣に `*.test.tsx`
- 実行: `make test-web`（`apps/web` のテストと一緒に動く）
- 環境: happy-dom。設定は `vitest.config.ts`。幅は `src/test/helpers.ts` の `setPhoneWidth()` で変える（`matchMedia` が幅に合わせて変わる）
- happy-dom で動かない React Aria の操作: ツールバーやボタンのグループ・Tabs で ← を押して前の要素へ移る操作、トレイやダイアログやメニューを開いたときの中へのフォーカス（ComboBox のトレイの入力欄、DatePicker のカレンダーの日、AlertDialog の `autoFocusButton`、Menu の最初の項目）とそれに続くキー操作、日付の欄（DatePicker の月・日・年）への入力。これらは `e2e/components.spec.ts`（Chromium）で確かめる。重ねて出す部品の位置（トレイ・全画面のシート・中央のカード）と、開いた状態の axe の検査、タッチの長押し（Tooltip）も E2E で確かめる。jsdom は `make test-web` が使う Bun の実行環境では起動しない
- happy-dom に無いもの: Slide が数字の列の幅を測るキャンバスと書体の読み込み（`document.fonts`）。部品のテストは `src/test/helpers.ts` の `mockTextMeasure()` で代わりを置く。happy-dom は `cqw` の長さを捨てるので、スライドの文字の大きさがスライドの幅に対する割合になっていることは E2E で確かめる
