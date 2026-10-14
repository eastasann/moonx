# moonx

地方で地元ビジネスを始めたい人が、自己分析からアイデア検証、ビジネスプランまでを、スマホと Web で迷わず進められる起業検討アプリ。範囲とスコープ外は `docs/01_prd.md` が正。

## Tech Stack

- Frontend: TanStack Start（SPA モード）・TanStack Router / Form / Query、React Aria Components ＋ vanilla-extract（Tailwind は使わない）、i18next、Lucide、PWA（vite-plugin-pwa の `injectManifest`）
- Backend: ElysiaJS（Bun）、Eden Treaty、Drizzle ORM 0.45 系（postgres.js）＋ Zod v4、react-pdf
- DB: PostgreSQL 17（local は Docker、staging / production は Neon。Neon 独自の機能は使わない）
- Auth: Better Auth（メール＋パスワード、Google。招待制をサーバーで強制する）
- Infra: Google Cloud Run（asia-southeast1。Web と API を1つのイメージで配る）、Cloud Storage、Secret Manager、Resend（メール）、Sentry、DNS は Vercel
- IaC: Terraform（`infra/terraform/`）
- CI/CD: GitHub Actions ＋ Workload Identity Federation（`main` で動くワークフローだけ）
- Monorepo: Bun workspaces ＋ Makefile
- Language: TypeScript（アプリ・パッケージ・スクリプトのすべて）
- Test / Lint: Bun test・Vitest ＋ Testing Library・Playwright ＋ axe・Biome

## Structure

構成の正は `docs/02-01_system-design-doc.md` 2章「リポジトリ構成」。

- apps/web: TanStack Start の SPA と Service Worker
- apps/api: ElysiaJS。Better Auth・REST API・PDF・Web の静的ファイルの配信。Dockerfile は Web のビルドも入れる
- packages/domain: 計算・確認項目・F/A/U・工程・Pitch Deck の組み立て・AI 書き出し / 取り込みの書式（純粋関数）
- packages/schemas: Zod のスキーマ（API の入出力とフォームの入力チェック）
- packages/db: Drizzle のスキーマ・マイグレーション・シード・KPI の SQL・テンプレートの取り込みと公開（AD10・AD6）
- packages/i18n: 英語のカタログと書式（en-PH）
- packages/ui-tokens: `docs/06_design-tokens.json` から生成するテーマと PWA のアイコン・マニフェスト（`src/generated/` は生成物で手で直さない。`src/types.ts` などは手で書く。ADR-025）
- packages/ui-web: Web の部品（design-spec 4.5）とレイアウトのパターン A〜J
- data/templates/bcdx/: BCDX のテンプレートのファイル（運営者が取り込む。シードも使う）
- infra/terraform/: `modules/` と `envs/{shared,staging,production}/`
- deploy/{staging,production}/version: その環境に出すコミット SHA（`make promote` が書く）
- e2e/: Playwright。docker/: ローカルの PostgreSQL の初期化 SQL。scripts/: doc-lint・画面の検査・db-check・promote・promote-check

## Key Design Decisions

- 画面にスタイルを書かない。見た目は `packages/ui-web` の部品だけで作り、部品は `docs/06_design-tokens.json` の semantic 層から生成したテーマだけを参照する。UI の文言は `packages/i18n` のカタログに置き、日付・数値・金額は書式関数で出す（ADR-018・ADR-025・ADR-026・SDD 9章。スタイルと JSX の生の文字列は `make lint` が検査する）
- 計算・判定・入力チェックは、Web と API が `packages/domain`・`packages/schemas` の同じコードを使う（ADR-001・ADR-009）
- 保存は項目単位の自動保存と楽観ロック（`lock_version`、衝突は 409）。書き込みは `withHistory` を通し、本体の更新と同じトランザクションで `change_history` に書く（ADR-019・ADR-020）。保存できなかった入力は、ページを開いている間だけ再送する（ADR-021）
- 権限は API が確かめる。各ルートは呼べる人（`open` / `signedIn` / `operator` / `scoped` / `located`）を宣言し、宣言の無いルートがあれば API は起動しない（ADR-005）。正は SDD 7.1 の権限マトリクスで、エンドポイント × ロールの表駆動テストで守る。画面の出し分けは design-spec 2.2。招待制は Better Auth のフックでサーバーが強制する（ADR-010）
- Web は「`/*` は静的ファイル、`/api/*` は API」の形で API と同じ Cloud Run から配り、環境ごとの値はイメージに焼かず HTML の meta 要素で渡す（ADR-004）。DB は戻せないので、1回の昇格のマイグレーションは今動いている版の API がそのまま動くものだけにし、消す変更は expand / contract で別の昇格に分ける（ADR-016・`docs/04_deployment-procedure.md` 4.1）

## Commands

実コマンドの正は Makefile、各ターゲットの中身は `docs/02-01_system-design-doc.md` 2章「make ターゲット」。

- `make setup`: 最初のセットアップ（依存・`.env`・DB・シード・トークン・Git のフック）
- `make dev`: API と Web を起動（`make dev-api`・`make dev-web` で片方だけ）
- `make build`: 全パッケージの型チェックとビルド
- `make test`: 単体・結合テスト（`make test-domain`・`make test-api`・`make test-web`）。E2E は `make test-e2e`
- `make lint` / `make format` / `make typecheck`: Biome と画面の検査・整形・型チェック
- `make db-up` / `make db-down`: ローカルの PostgreSQL の起動・停止
- `make db-generate`: スキーマからマイグレーションを作る。`make db-check BASE=...` で足すだけになっているかを検査する
- `make db-migrate`: マイグレーションを当てる
- `make db-seed` / `make db-reset`: デモデータを入れ直す / DB を作り直す（どちらもローカルのデータを消す）
- `make db-studio`: Drizzle Studio
- `make tokens`: `docs/06_design-tokens.json` から `packages/ui-tokens` を作る
- `make openapi`: `apps/api/openapi.json` を作り直す
- `make admin-create EMAIL=...`: 最初の運営者の招待を出す
- `make infra-plan ENV=...` / `make infra-apply ENV=...`: Terraform（人が動かす）
- `make promote ENV=... [SHA=...]`: 昇格とロールバックの PR を作る（人が動かす）
- `make doc-lint`: ドキュメントと実体の食い違いを検査する（コミット前の検査は pre-commit のフックが動かす）

CI が使うターゲット（`install`・`build-web`・`build-api-image`・`deploy-api`・`promote-check`・`db-backup`・`kpi`）は SDD 2章と `docs/04_deployment-procedure.md` 2章。

## Docs

詳細は `docs/` にある。このファイルと `docs/claude-code-prompts.md` は `docs/` から作った派生物で、食い違ったら `docs/` が正。どの事実をどの文書が持つかは `docs/README.md` の所有権マップ。

- docs/design-spec.md: 画面・UX・ロールと権限（画面の単位）・入力の規則・デザインの方針と部品・デモデータ
- docs/screen_flow.mermaid: 画面遷移
- docs/01_prd.md: ユーザーストーリーと優先度・KPI・スコープ外
- docs/02-01_system-design-doc.md: アーキテクチャ・ADR・環境変数・make ターゲット・ルーティング・API・データモデル・権限マトリクス・エラー・i18n・テスト・監視
- docs/02-02_feature-design-doc.md: 変更のサイクルの Feature Design Doc の雛形
- docs/03_dev-setup.md: 開発環境・ツール・デザインのスキルの使い分け・実装のエージェントの決まり・コメントの書き方・ブランチ戦略・クラウドの初期設定
- docs/04_deployment-procedure.md: CI/CD・昇格・ロールバック・デプロイ後の確認
- docs/05_operation-runbook.md: 監視・障害の対処・定期メンテナンス
- docs/06_design-tokens.json: デザイントークン（DTCG 形式。スタイリングの値の正。実装のテーマはここから生成し、semantic 層だけを参照する）

## Implementation Rules

- **先送りしない。完了とは残作業がゼロの状態。** TODO/FIXMEコメント、固定値やモックを返す仮実装、握りつぶした例外、通していない経路、完了報告の「今後の課題」節は、すべて先送りの言い換えでしかない。禁止しているのは形ではなく先送りそのもの。残したくなったら設計に曖昧さがあるサインなので、実装を止めて確認し、設計ドキュメントに反映してから実装する
- **設計の不備を実装で回避しない。** 「設計ドキュメントの記述では要件が満たせない・記述同士が矛盾している・必要な決定が欠けている」と気づいたら、実装側の回避策で辻褄を合わせて進まない。手を止めて不備の内容・影響・直し方を提示し、合意の上で設計ドキュメントを直してから、直った設計を入力に実装を再開する
- **仕様を弱める変更は自分で決めない。無人ループでも同じ。** 機能・検査・制約・文言を減らす・緩める変更と、docs の記述を実装に合わせて弱める書き換えがこれにあたる。/draft:implement の無人ループがソース層を自分で直すときも、完了時に docs を実装に合わせるときも、弱めない直し方に限る。弱めるしかないときは手を止め、弱める点・理由・選択肢を示してユーザーの判断を待つ（無人ループでは `Status: blocked YYYY-MM-DD` にして、直後の行に弱める点と理由を書く）。ステップを分けて残りを新しいステップに書き出すのは、弱める変更にあたらない（`docs/03_dev-setup.md` 1章）
- **自分で決めたことはすべて報告する。** docs に書かれていない細部（名前・既定値・並び順・ライブラリの使い方など）を決めたら、完了報告とコミットの本文に、決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所を書く。自分で決めてよいのは、画面と API の外から見える振る舞い（応答・状態・権限・文言の意味）を変えない細部だけ。変えるものは「設計の不備」として扱う
- **スコープを黙って縮めない。** 縮める判断はユーザーのもの。合意を取り、残りをドキュメントに書き出してから完了とする
- **合意を求めることを完了の代わりにしない。** 合意が要るのは、ユーザーのスコープを縮めるときと仕様を弱めるときだけ。自分の変更が作った穴・自分で見つけた欠陥は、「これも直しますか」と聞かずにその場で閉じる。それは縮小ではなく完了条件
- **残すときは、閉じられない理由を具体的に挙げる。** 「後で」ではなく何がブロックしているか（ユーザーの決定が要る／認証情報や外部リソースが無い／別の作業に依存する）を、先送りするその時点で述べる。理由を具体的に挙げられないなら閉じられるということなので閉じる。残す先はリポジトリ内のファイルだけ。ファイルに書かれていないものは残っておらず、消えている（チャットや完了報告での言及は記録ではない）
- **場当たり的な修正をしない。** エラーやバグは症状を抑えるパッチではなく、根本原因を特定し、原因と修正方針を提示してから直す。症状だけ抑えるパッチは原因の解決を後ろに送る先送りの一形態。設計に関わる修正はユーザーの合意を得てから行う
- **コメントはコードから読み取れないことだけを書く。** 処理の言い換え（`// ユーザーを取得する` の直後に `getUser()`）は書かない。書くのは「なぜこの実装なのか」「不変条件」「外部制約」「呼び出し側の契約」。密度と体裁は周囲の既存コードに合わせる
- **生成物は手で直さない。** `packages/ui-tokens/src/generated/` と `apps/api/openapi.json` は、ソースを直して `make tokens`・`make openapi` で作り直す。`apps/web/src/routeTree.gen.ts` は `src/routes/` から `make dev-web`・`make build-web` が作り直す（`docs/03_dev-setup.md` 10章）
- **`main` にあるマイグレーションは書き換えない・消さない。** 直すときは新しいマイグレーションを足す。`main` に後から入ったものより `when` が古くなったら作り直す（`make db-check` が検査する）
- **デザインのスキルは `docs/03_dev-setup.md` 1章の使い分け（目安）を見て選ぶ。** どのスキルの案も design-spec 4.4・4.5 と `docs/06_design-tokens.json` に合うものだけを使い、使ったスキルはユーザーに伝える
- **不要になった `.gitkeep` は削除する。** ディレクトリに実ファイルを追加したら、その中の `.gitkeep` を消す
- **自動メモリに docs/ が所有する事実を転記しない。** MEMORY.md等、ツールがセッション外に蓄積するメモが対象。食い違ったらソースDocが正
- **実装セッションに本番環境の資格情報を渡さない。** 本番への操作は `docs/04_deployment-procedure.md` の手順で行う（セッションが本番リソースへ直接触れる構成にしない）
- **破壊的操作は実行前に明示して確認を取る。** DBのdrop/reset、`rm -rf`、本番リソースの変更は、対象と影響を提示してユーザーの確認を得てから実行する。例外は、手元の Docker の DB（`moonx`・`moonx_test`）を消す make ターゲット（`make db-seed`・`make db-reset`、`make test-api`・`make test-e2e` のテスト用の DB の作り直しと、それらを呼ぶ `make setup`・`make test`）で、確認なしで動かしてよい（`docs/03_dev-setup.md` 1章）

## Code Style

- Conventional Commits: feat:, fix:, refactor:, docs:, test:, chore:（範囲が分かれば `feat(api):` のように付ける。`docs/03_dev-setup.md` 9章）
- コミットメッセージの言語: 英語（既存の履歴に合わせる）
- コミットのトレーラーは付けない（`Co-Authored-By`、セッションURL等）。ツールや実行環境が既定で付けようとする場合も、この規約が優先する
- コミットのサブジェクトは50字を目安に、72字を超えない。本文は空行を挟んで表示幅72カラムで折り返す（全角は2カラム）
- **コミット本文はdiffから読み取れないことだけを書く。** 書くのは「なぜ変えたか」「採らなかった案」「どこまで検証したか」。変更ファイルの一覧やバージョン番号の更新は `git show --stat` の仕事。長さを既存の履歴に合わせない（直前のコミットを基準にすると単調に膨らむ）
- ブランチは `feature/xxx`・`fix/xxx`。`main` へは PR の squash マージだけ（`docs/03_dev-setup.md` 9章）
- Biome（リントと整形）＋ TypeScript の型チェック
- コメント: 公開する関数と型の説明は TSDoc（`/** */`）。`NOTE:` などのプレフィックスは付けない。言語は英語（`docs/03_dev-setup.md` 10章）
- API の項目名は camelCase、DB の列は snake_case（Drizzle の `casing: "snake_case"`）。ID は UUID の文字列、率は 0〜1 の小数（SDD 5.1）

## Docs Style

- **テクニカルドキュメントとして書く。** 読んだ人が作業できることだけが目的。装飾・誇張・前置き・総括は情報を足さないので書かない
- **和文の本文でem dashを使わない。** 挿入句の区切りは読点・括弧・文の分割に置き換える。項目と説明を並べるリストは `ラベル: 説明` の形にする
- **太字は段落の頭の短いラベルとUI要素にだけ使う。** 文や表の1列目を太字で覆うと、強調された語が消える
- **対句（「AではなくB」）は意味を運ぶときだけ残す。** リズムのために置くと、対比の無い所に対比があるように読める
- **無生物主語と名詞止めは動詞で言い切る。** 「データは〜を示している」「〜の実施が重要である」は英語構文の残骸
- **概念の名前に英語の直訳をあてない。** 「人手を挟まず」(without human intervention) のような句は、日本語の用法から意味を確定できない。日常の会話にある言い回しから選び、無ければ用語として定義する

<!-- DRAFT: v0.43.0 -->
