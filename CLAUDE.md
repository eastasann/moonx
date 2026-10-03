# moonx

地方で地元ビジネスを始めたい人が、自己分析からアイデア検証、ビジネスプランまでを、スマホと Web で迷わず進められる起業検討アプリ。Web とスマホのネイティブアプリ（iOS / Android）が同じ API を使う。

## Tech Stack

- Web: TanStack Start（SPA モード）/ TypeScript / TanStack Router・Query・Form / React Aria Components ＋ vanilla-extract
- Mobile: Expo（React Native、New Architecture、Expo Router、開発ビルド）/ @rn-primitives ＋ @gorhom/bottom-sheet ＋ Unistyles v3
- Backend: ElysiaJS（Bun）/ REST `/api/v1`、クライアントは Eden Treaty / Zod v4 / Drizzle ORM（postgres.js）/ react-pdf
- DB: PostgreSQL 17（local は Docker、staging / production は Neon。Neon 独自の機能は使わない）
- Auth: Better Auth（メール＋パスワード、Google。Expo プラグイン。招待制をサーバーで強制）
- i18n: i18next（UI は英語のみで開始。書式は en-PH）
- Infra: Cloud Run（asia-southeast1）、Cloudflare Worker（静的ファイル＋`/api` の転送）、Secret Manager、Cloud Storage、Resend、Sentry、EAS（Build / Update、iOS の TestFlight への Submit）
- IaC: Terraform（Google Cloud と Cloudflare のゾーンの設定）＋ `apps/web/wrangler.jsonc`・`apps/mobile/eas.json`
- CI/CD: GitHub Actions（Workload Identity Federation）。デプロイは `deploy/{staging,production}/version` を変える昇格の PR
- Monorepo: Bun workspaces ＋ Makefile（パッケージ名は `@moonx/*`）
- Test / Lint: Bun test・Vitest・Jest（jest-expo）・Playwright・axe・Biome

## Structure

- apps/web: Web（TanStack Start）。`worker/` に Cloudflare Worker、`public/` に静的なファイル
- apps/mobile: スマホ（Expo Router）。`eas.json`・`app.config.ts`
- apps/api: API（Elysia）。Better Auth・REST API・PDF。Dockerfile
- packages/domain: 計算・確認項目・F/A/U・工程・Pitch Deck の組み立て・AI 書き出し / 取り込みの書式（純粋関数）
- packages/schemas: Zod のスキーマ（API の入出力とフォームの入力チェック）とエラーコード
- packages/db: Drizzle のスキーマ・マイグレーション・シード
- packages/i18n: 英語のメッセージカタログと書式の関数
- packages/ui-tokens: `docs/06_design-tokens.json` から生成するテーマ（`src/generated/` は生成物）
- packages/ui-web / packages/ui-native: Web とスマホの部品（同じ名前と props）
- infra/terraform: `modules/` と `envs/{shared,staging,production}/`
- deploy/{staging,production}/version: デプロイするコミット SHA
- e2e/: Playwright（Web）
- docker/・scripts/: ローカルの PostgreSQL の初期化 SQL / doc-lint と画面の検査スクリプト

## Key Design Decisions

- **画面にスタイルを書かない。** `apps/web`・`apps/mobile` の画面は、`packages/ui-web` / `packages/ui-native` の部品（design-spec 4.5 の名前）と、トークンの名前だけを受け取るレイアウトの部品で組む。見た目の値は `docs/06_design-tokens.json` の semantic 層だけを参照する。要る部品が無ければ design-spec 4.5 に足してから作る（ADR-018・ADR-025）
- **計算と判定は packages/domain の1か所。** 損益・確認項目・F/A/U・工程は Web・スマホ・API が同じ純粋関数で毎回計算し、DB に保存しない。数字の正は検証にあり、プランは参照するだけ（SDD 6.4・6.5）
- **項目単位の楽観ロックと、同じトランザクションの変更履歴。** 保存の単位の項目は `lockVersion` を持ち、食い違えば 409 を返す。履歴の対象のテーブルは `withHistory` を通してだけ更新する（ADR-019・ADR-020）
- **認可は API で、ワークスペースに絞って判定する。** `resolveScope` でリソースからワークスペースとロールを引き、クエリを必ずそのワークスペースで絞る。招待制はサーバーで強制する。UI は権限の無い操作のボタンを出さない（SDD 7.1、ADR-010、design-spec 1.3）
- **依存先を乗り換えられる形を保つ。** DB は標準の PostgreSQL として使い、Web は「静的ファイル＋`/api` の転送」だけで配る。Web とスマホは別のコードで作り、パスは同じにする（ADR-001・ADR-004・ADR-008、SDD 4章）

## Commands

<!-- Makefileが実コマンドの唯一の真実源。ここには標準ターゲット名だけを書き、生コマンド（bun等）を複製しない。ターゲットの定義は SDD 2章「make ターゲット」。 -->

- `make setup`: First-time setup（依存・`.env`・DB・シード・トークン・Git のフック）
- `make dev`: API と Web を起動（単独は `make dev-api` / `make dev-web`、スマホは `make dev-mobile`）
- `make build`: 全パッケージの型チェックとビルド
- `make test`: 単体・結合テスト（`make test-domain` / `make test-api` / `make test-web` / `make test-mobile`）
- `make test-e2e`: Playwright（Web）
- `make lint` / `make format` / `make typecheck`: Biome の検査・整形、型チェック
- `make db-up` / `make db-down`: ローカルの PostgreSQL の起動・停止
- `make db-generate`: スキーマからマイグレーションを作る
- `make db-migrate`: マイグレーションを当てる
- `make db-seed`: デモデータを入れる（全テーブルを空にするので手元のデータが消える。`APP_ENV=local` だけ）
- `make db-reset`: DB を作り直す
- `make db-studio`: Drizzle Studio
- `make tokens`: `docs/06_design-tokens.json` から `packages/ui-tokens` を生成する
- `make openapi`: OpenAPI を `apps/api/openapi.json` に書き出す
- `make admin-create EMAIL=...`: 最初の運営者の招待を出す
- `make doc-lint`: Check docs↔reality drift (staged checks run via pre-commit hook)
- デプロイ系（`build-web`・`build-api-image`・`deploy-api`・`deploy-web`・`mobile-update`・`mobile-build`・`infra-plan`・`infra-apply`・`db-backup`）: CI と `docs/04_deployment-procedure.md` の手順が使う

## Docs

Detailed specifications are in `docs/`. This file and `docs/claude-code-prompts.md` are derived from `docs/`. If they disagree, `docs/` is the source of truth. 事実ごとの正のドキュメントは `docs/README.md` の所有権マップに従う:

- docs/README.md: 読み順・ドキュメントの層・事実の所有権マップ
- docs/design-spec.md: 画面一覧と画面ごとの仕様・UX・ロールと権限・レイアウトパターン・部品の一覧（4.5）・デモデータ
- docs/screen_flow.mermaid: 画面遷移
- docs/01_prd.md: User stories（優先度）, KPI, scope
- docs/02-01_system-design-doc.md: Architecture, ADRs, 環境変数, make ターゲット, ルーティング, API design, DB schema（Drizzle）, 権限マトリクス, エラー, i18n, テスト戦略, 監視
- docs/02-02_feature-design-doc.md: Template for change-cycle FDDs
- docs/03_dev-setup.md: 開発環境・クラウドの初期設定・テストの回し方・ブランチ戦略・トラブルシューティング
- docs/04_deployment-procedure.md: Deploy, CI/CD, スマホの配布（内部配布・TestFlight）, rollback
- docs/05_operation-runbook.md: Monitoring, incident response, 定期メンテナンス
- docs/06_design-tokens.json: Design tokens（DTCG形式。色・タイポグラフィ・余白などスタイリング値の正。実装のテーマは `make tokens` でここから派生させ、セマンティック層のみ参照する）
- docs/concept.md・docs/brainstorm-notes.md: アーカイブ（決めた経緯。今の正ではない。brainstorm-notes の付録に Drive のテンプレートの構成がある）

## Implementation Rules

- **先送りしない。完了とは残作業がゼロの状態。** TODO/FIXMEコメント、固定値やモックを返す仮実装、握りつぶした例外、通していない経路、完了報告の「今後の課題」節は、すべて先送りの言い換えでしかない。禁止しているのは形ではなく先送りそのもの。残したくなったら設計に曖昧さがあるサインなので、実装を止めて確認し、設計ドキュメントに反映してから実装する
- **設計の不備を実装で回避しない。** 「設計ドキュメントの記述では要件が満たせない・記述同士が矛盾している・必要な決定が欠けている」と気づいたら、実装側の回避策で辻褄を合わせて進まない。手を止めて不備の内容・影響・直し方を提示し、合意の上で設計ドキュメントを直してから、直った設計を入力に実装を再開する
- **スコープを黙って縮めない。** 縮める判断はユーザーのもの。合意を取り、残りをドキュメントに書き出してから完了とする
- **合意を求めることを完了の代わりにしない。** 合意が要るのはユーザーのスコープを縮めるときだけ。自分の変更が作った穴・自分で見つけた欠陥は、「これも直しますか」と聞かずにその場で閉じる。それは縮小ではなく完了条件
- **残すときは、閉じられない理由を具体的に挙げる。** 「後で」ではなく何がブロックしているか（ユーザーの決定が要る／認証情報や外部リソースが無い／別の作業に依存する）を、先送りするその時点で述べる。理由を具体的に挙げられないなら閉じられるということなので閉じる。残す先はリポジトリ内のファイルだけ。ファイルに書かれていないものは残っておらず、消えている（チャットや完了報告での言及は記録ではない）
- **場当たり的な修正をしない。** エラーやバグは症状を抑えるパッチではなく、根本原因を特定し、原因と修正方針を提示してから直す。症状だけ抑えるパッチは原因の解決を後ろに送る先送りの一形態。設計に関わる修正はユーザーの合意を得てから行う
- **コメントはコードから読み取れないことだけを書く。** 処理の言い換え（`// ユーザーを取得する` の直後に `getUser()`）は書かない。書くのは「なぜこの実装なのか」「不変条件」「外部制約」「呼び出し側の契約」。密度と体裁は周囲の既存コードに合わせる
- **不要になった `.gitkeep` は削除する。** ディレクトリに実ファイルを追加したら、その中の `.gitkeep` を消す
- **自動メモリに docs/ が所有する事実を転記しない。** MEMORY.md等、ツールがセッション外に蓄積するメモが対象。食い違ったらソースDocが正
- **実装セッションに本番環境の資格情報を渡さない。** 本番への操作は `docs/04_deployment-procedure.md` の手順で行う（セッションが本番リソースへ直接触れる構成にしない）
- **破壊的操作は実行前に明示して確認を取る。** DBのdrop/reset、`rm -rf`、本番リソースの変更は、対象と影響を提示してユーザーの確認を得てから実行する

## Code Style

- Conventional Commits: feat:, fix:, refactor:, docs:, test:, chore:（範囲が分かれば `feat(api):` のように付ける）
- コミットメッセージの言語: 英語
- コミットのトレーラーは付けない（`Co-Authored-By`、セッションURL等）。ツールや実行環境が既定で付けようとする場合も、この規約が優先する
- コミットのサブジェクトは50字を目安に、72字を超えない。本文は空行を挟んで表示幅72カラムで折り返す（全角は2カラム）
- **コミット本文はdiffから読み取れないことだけを書く。** 書くのは「なぜ変えたか」「採らなかった案」「どこまで検証したか」。変更ファイルの一覧やバージョン番号の更新は `git show --stat` の仕事。長さを既存の履歴に合わせない（直前のコミットを基準にすると単調に膨らむ）
- ブランチは `feature/xxx`・`fix/xxx`。`main` へは PR の squash マージだけ（`docs/03_dev-setup.md` 9章）
- Biome（リントと整形）＋ TypeScript の型チェック。画面のスタイルの禁止は `make lint` が検出する
- コメント: 公開する関数と型の説明は TSDoc（`/** */`）。`NOTE:` などのプレフィックスは付けない。言語は英語
- UI の文言はコードに直接書かず `packages/i18n` のカタログに置く。日付・数値・金額は `packages/i18n` の書式関数だけで出す（SDD 9章）
- API の項目名は camelCase、DB の列は snake_case（Drizzle の `casing: "snake_case"`）。ID は UUID の文字列、率は 0〜1 の小数（SDD 5.1）
- 生成物（`packages/ui-tokens/src/generated/`・`apps/api/openapi.json`）は手で直さない。ソースを直して作り直す
- マイグレーションは「追加してから使い、使わなくなってから消す」の2段階で書く。適用済みの SQL は書き換えない（`docs/04_deployment-procedure.md` 4.1）

## Docs Style

<!-- ドキュメントを書くときの規約。決定論的な違反（本文のem dash・表1列目の太字・長すぎる太字）は `make doc-lint` が検出する。 -->

- **テクニカルドキュメントとして書く。** 読んだ人が作業できることだけが目的。装飾・誇張・前置き・総括は情報を足さないので書かない
- **和文の本文でem dashを使わない。** 挿入句の区切りは読点・括弧・文の分割に置き換える。項目と説明を並べるリストは `ラベル: 説明` の形にする
- **太字は段落の頭の短いラベルとUI要素にだけ使う。** 文や表の1列目を太字で覆うと、強調された語が消える
- **対句（「AではなくB」）は意味を運ぶときだけ残す。** リズムのために置くと、対比の無い所に対比があるように読める
- **無生物主語と名詞止めは動詞で言い切る。** 「データは〜を示している」「〜の実施が重要である」は英語構文の残骸
- **概念の名前に英語の直訳をあてない。** 「人手を挟まず」(without human intervention) のような句は、日本語の用法から意味を確定できない。日常の会話にある言い回しから選び、無ければ用語として定義する

<!-- DRAFT: v0.43.0 -->
