# moonx — Claude Code プロンプト集

Claude Code のチャットに **1つずつ** コピペして使う（`/draft:implement` はこのファイルを読んで1ステップずつ実行する）。
前のステップが完了・動作確認できてから次を投げること。
このファイルは派生物。docs/ のソース層から再生成でき、docs/ と食い違ったら docs/ が正。

ステップの並びは依存の順（骨格 → DB → 共有のロジック → API → 認証 → UI → インフラ → テスト）。UI は Web の全画面を先に作り、次にスマホを作る。スマホのステップは Expo のアカウントと端末での確認が要り、無人では進められないため。各端末の中では、PRD 4章の優先度に合わせてコアフロー（Must）を先に作り、残りの画面を Must → Should → Could の順に作る。

**チャット分割の目安:**
- Step 1〜2 → Chat 1
- Step 3 以降 → 1ステップ = 1チャット（UI のステップは重いので、まとめない）

---

各Stepの見出し直下の `Status:` 行が進捗の記録先。値は次の3つで、無人ループの停止判定にも使われる:

- 空欄: 未着手
- `done YYYY-MM-DD`: 動作確認まで完了
- `blocked YYYY-MM-DD`: 着手したが、人の判断なしには閉じられない。直後の1行に閉じられない理由を具体的に書く

/draft:prep を再実行して作り直すときは、この行（とブロッカーの理由行）と追記されたステップを新版へ移送する。

## Step 1: モノレポ骨格と開発環境

Status: done 2026-10-02

```
docs/02-01_system-design-doc.md の2章（リポジトリ構成・環境と命名・環境変数・make ターゲット）と
ADR-017・ADR-022・ADR-025、docs/03_dev-setup.md の1章・3章・10章に従って、
モノレポの骨格と開発環境を作ってください。

やること:
1. `.git` が無ければ `git init`。Bun workspaces のルート package.json（apps/*・packages/*、
   パッケージ名は @moonx/*）、共通の tsconfig、.gitignore（.env・.data/ を除外。
   packages/ui-tokens/src/generated/ と apps/api/openapi.json はコミットする）
2. apps/api: ElysiaJS（Bun）。/api/health（SDD 5.14 の Z1。DB に触れない）を返す。ポートは PORT（local 3000）
3. apps/web: TanStack Start の SPA モード（ADR-002）。Vite の /api を http://localhost:3000 へ転送し、
   envDir はリポジトリの直下。vanilla-extract の Vite プラグインを組み込む（動かなければ ADR-025 に書いた
   代わりの方法（packages/ui-web で事前にビルド）を採り、採ったことを ADR-025 に書き足す）
4. apps/mobile: Expo（New Architecture、Expo Router、開発ビルド前提で Expo Go は使わない。ADR-003）。
   app.config.ts は EXPO_PUBLIC_APP_ENV でスキーム（moonx / moonx-staging）を切り替える。
   Unistyles・@gorhom/bottom-sheet などネイティブの依存と開発ビルドは Step 18 で入れる
5. packages/domain・schemas・db・i18n・ui-tokens・ui-web・ui-native: package.json・tsconfig・入口の index.ts。
   中身は後のステップ（.gitkeep は置かない）
6. docker-compose.yml: PostgreSQL 17（localhost:5432、ユーザーとパスワードは moonx）。
   初期化で開発用の DB moonx とテスト用の DB moonx_test を作る
7. .env.example（直下）と apps/mobile/.env.example: SDD 2章「環境変数」の local の値
8. Biome（リントと整形）。画面にスタイルを書かない決まり（ADR-025）: apps/web・apps/mobile の画面での
   @vanilla-extract/css・StyleSheet・Unistyles の直接の import を noRestrictedImports で禁止する。
   style 属性に値を書くことと JSX の中の生の文字列（SDD 9章）は、Biome で足りない分を小さな検査スクリプトで
   見つけ、make lint から呼ぶ
9. テストの土台（ADR-022）: Bun test（domain・schemas・i18n・api）、Vitest ＋ Testing Library（web・ui-web）、
   Jest（jest-expo）＋ React Native Testing Library（mobile・ui-native）。テストの対象があるもの
   （api の /api/health、web と mobile のルートの描画）にテストを書く。中身がまだ無いパッケージで
   make test-* が失敗しない設定にする（空のテストは書かない）
10. Makefile: SDD 2章「make ターゲット」の全ターゲットを、実コマンドへの薄い委譲として定義する。
   直下の .env を読み込んで各コマンドに渡す。以後の操作はすべて make 経由で行う。
   doc-lint は scripts/doc-lint.sh --docs を呼び、setup は git config core.hooksPath .githooks を含める
   （scripts/doc-lint.sh と .githooks/pre-commit は Phase 4 で配置済み）。
   対象を後のステップで作るターゲット（シード・トークンの生成・Terraform・Dockerfile・Worker・EAS など）も
   SDD のとおりの実コマンドで書き、動くことはその対象を作るステップで確かめる

まだ DB のスキーマ・画面・部品・認証・インフラは作らない。

make install と make db-up が通り、make dev で API と Web が起動して
curl http://localhost:3000/api/health と curl http://localhost:5173/api/health がどちらも 200 を返し、
make dev-mobile で Expo の開発サーバーが起動し、
make lint・make typecheck・make test・make doc-lint が通る状態をゴールとする。
make setup の通しの確認は Step 5 で行う（シードとトークンの生成がまだ無いため）。
```

---

## Step 2: DB スキーマとマイグレーション

Status: done 2026-10-02

```
docs/02-01_system-design-doc.md の6章（データモデル）と ADR-008・ADR-009 に従って、
DB のスキーマとマイグレーションを作ってください。

やること:
1. packages/db/src/schema.ts: 6.3 の Drizzle のスキーマを、全テーブル・列挙・check 制約・インデックスまで写す。
   6.3 が正。写している途中で記述の食い違いや欠けに気づいたら、写す前に止めて報告する
2. packages/db/src/relations.ts（外部キーと同じ対応の relations()）
3. drizzle.config.ts と DB の接続モジュール（postgres.js、casing: "snake_case"。API はプール接続を
   前提に prepare: false、プールの上限はインスタンスごとに5。SDD 7.3）
4. make db-generate で最初のマイグレーションを作り、SQL を読んで 6.3 と合っているか確かめる
   （check 制約と一意制約が入っていること）
5. make db-migrate で開発用の DB に当てる。テスト用の DB（DATABASE_URL_TEST）を作り直して当てる手段を、
   make test-api から使える形で用意する

まだシード（Step 5）と API は作らない。

make db-generate → make db-migrate が通り、make db-studio で 6.3 の全テーブルが見え、
テスト用の DB にも同じマイグレーションが当たり、make typecheck が通る状態をゴールとする。
```

---

## Step 3: 計算と判定・共通の型・書式（packages/domain・schemas・i18n）

Status:

```
Web・スマホ・API が同じコードを使う共有パッケージを作ってください（ADR-001）。

参照:
- docs/design-spec.md 6.0.3（F/A/U の状態）・6.1（確認項目の自動判定ルールと Next steps）・
  6.4（計算仕様と主要指標）・8.3（検算用データ）・1.2（書式）
- docs/02-01_system-design-doc.md 5.2（共通の型）・6.4（保存しないもの）・8.1（エラーコード）・9章（i18n）・10章

やること:
1. packages/domain（純粋関数。DB にもフレームワークにも依存しない。入出力の型は SDD 5.2 に合わせる）:
   - 損益の計算（EconomicsResult。MetricValue の bound と reason、費用の未入力・Unknown による下限と上限、警告、既定値の使用）
   - 確認項目6つの判定（テンプレートの基準値を引数で受け取る）と Next steps（上から最大3件）
   - F/A/U の状態（FauState）と内訳（FauBreakdown）
   - 工程（Stage）の決定
2. packages/schemas: SDD 5.2 の共通の型の Zod v4 スキーマと、8.1 のエラーコードの一覧（src/errors.ts）。
   エンドポイントごとの入出力のスキーマは、そのエンドポイントを作るステップで足す
3. packages/i18n: i18next の初期化（Web・スマホ・API で共有）、locales/en/ のカタログ（キーは画面と部品ごと）、
   書式関数（formatMoney・formatUnits・formatPercent・formatDate・formatTime・formatIsoDate。en-PH。
   端数と下限・上限の記号は design-spec 6.4）
4. テスト（Bun test。make test-domain）: 8.3 の検算データが期待値どおりになる固定のテスト、下限・上限の伝播、
   端数、確認項目6つの全状態、Next steps の優先順、F/A/U の状態と内訳、工程、スキーマの境界値、書式

buildPitchDeck() と AI 書き出し・取り込みの書式は Step 7 で作る。

make test-domain が通り、8.3 の期待値（損益分岐 180.1件/月・6.9件/日、Expected の営業利益 ₱18,490、
回収 9.2か月、単純 ROI 130.9% など）をテストが再現し、packages/domain の行カバレッジが 95% 以上で、
make typecheck・make lint が通る状態をゴールとする。
```

---

## Step 4: デザイントークンの生成（packages/ui-tokens）

Status:

```
docs/02-01_system-design-doc.md の ADR-018 に従って、docs/06_design-tokens.json から
packages/ui-tokens を生成する make tokens を作ってください。

やること:
1. 変換スクリプト（自前。Style Dictionary は使わない）: DTCG の JSON を読み、semantic のエイリアスを
   primitive まで解決する。書体のスタイルと密度は semantic.scale.medium を参照し、生成のときに large へ差し替える
2. 出力（packages/ui-tokens/src/generated/。コミットする）:
   - Web: vanilla-extract のテーマ（createGlobalThemeContract の型付きの契約と、ライト / ダーク × medium / large の値）
   - スマホ: Unistyles のテーマ（ライト / ダーク。large のスケールを既定）とブレークポイント
   - PDF: react-pdf 用の定数（常にライト。semantic.print）
   外に出すのは semantic だけにし、primitive を実装から参照できないようにする
3. 手で書くファイル（src/types.ts など）: 部品の共通の値の型（size・variant など。ADR-025）
4. 検査（SDD 10章「デザイントークン」）: エイリアスの参照先が実在すること、意味色のコントラストが WCAG AA を
   満たすこと。make tokens の中で動かし、失敗したら止める。06 の値そのものが基準を満たさないと分かったら、
   トークンを直す前に止めて報告する（06 が正）

make tokens が通り、2回続けて動かしても生成物に差分が出ず、
参照先の無いエイリアスやコントラストの足りない組み合わせを一時的に入れると make tokens が失敗する
（確かめたら戻す）状態をゴールとする。
```

---

## Step 5: テンプレート v1 とデモデータのシード

Status:

```
docs/design-spec.md 8章（デモデータ仕様）と docs/02-01_system-design-doc.md 6.5（シード）に従って、
make db-seed を作ってください。

やること:
1. テンプレート v1 の中身（自己分析36問・検証の設問・プランの小項目の問いと Example・セクションのガイダンス・
   AI 用プロンプト・確認項目の基準値・費用行の初期値・実行管理の初期行）を packages/db/seed/templates/ に置く。
   構成は docs/brainstorm-notes.md の付録と design-spec 6.6（設問 ID）・6.12・6.13 に従い、
   問いの本文・EXAMPLE・ガイダンス・選択肢・AI 用プロンプトは docs/drive-templates/ の原本の写しから転記する
   （design-spec 9.3）。写しに無い文面を推測で作らない
2. テンプレートの版: 3つとも v1 を公開。検証は v2（設問を1つ追加）も公開し、v3 は下書き（design-spec 8.4）
3. デモデータ: 8.1（ユーザー・ワークスペース・招待）、8.2（アイデア6件の状態の組み合わせ）、
   8.3（Piaya の検算用の数字）、8.4（調査ログ・競合・コメント・通知・決定ログ・変更履歴）。
   パスワードは Better Auth と同じ方式でハッシュにして入れ（Step 9 でそのままログインできるように）、
   デモのパスワードを design-spec 8.1 に書き足す
4. シードは何度動かしても同じ状態になる（入れ直しで重複しない）
5. 確認のテスト（make test-api）: シードを入れた DB で packages/domain の判定を動かし、8.4 の確認項目の状態
   （Piaya は6つとも達成、Health Bowl は 1・2・4・6 達成 / 3 途中 / 5 未着手、Bike Repair は6つとも未着手）と、
   Piaya の損益が 8.3 の期待値になることを確かめる

.env と DB が無い状態（新しい clone と同じ）から make setup が最後まで通り、
make db-studio でデモデータが見え、make db-reset で作り直せ、make test-api が通る状態をゴールとする。
```

---

## Step 6: API の基盤とワークスペース・アイデア・検証の API

Status:

```
docs/02-01_system-design-doc.md の 5.1〜5.3・5.5〜5.7・5.14（Z2）・7章・8.1・8.3 と
ADR-005・ADR-006・ADR-019・ADR-020・ADR-023・ADR-029 に従って、API の基盤と、
ワークスペース・ダッシュボード・アイデア・検証のエンドポイントを実装してください。

やること:
1. 基盤（apps/api）:
   - ドメインごとの Elysia のプラグイン、/api/v1 の下の REST、Zod v4（Standard Schema）での入出力の検査
   - エラーの形式（8.1）とコード（packages/schemas の errors.ts）。500 では詳細を返さない
   - リクエスト ID（X-Request-Id。無ければ作る）、1行1つの JSON のログ（ADR-023 の項目）、Sentry（sendDefaultPii: false）
   - 応答はすべて Cache-Control: no-store。CSRF の決まり（7.2）。Worker の共有シークレットの検査
     （2章 通信フロー 3。PROXY_SHARED_SECRET が空の local では検査しない）
   - X-Moonx-Client / X-Moonx-App-Version の記録と 426 APP_UPDATE_REQUIRED（最低の版はコードの定数）
   - 認可: resolveScope（7.1「実装」）。クエリは必ずそのワークスペースで絞る。アーカイブは 409 ARCHIVED
   - 変更履歴の withHistory（ADR-020）と楽観ロック（ADR-019: lockVersion、409 CONFLICT と current、force）
   - アプリの回数制限のミドルウェア（ADR-029 の②。rate_limits に app: の接頭辞）
   - メールの送信（MAIL_TRANSPORT=console は API のログに出す、resend は Resend の HTTP API。
     staging は MAIL_ALLOWLIST。文面は packages/i18n）
   - make openapi と /api/docs（APP_ENV=staging のときだけ）、Z2 /api/health/db
2. エンドポイント: W0〜W8（5.5）、D1〜D4・I1〜I4（5.6）、V1〜V19（5.7）。計算と判定は packages/domain の関数を
   使い、保存しない（5.1「計算」）。入出力のスキーマは packages/schemas に足す。招待の送信の回数制限（7.2）
3. ログイン中のユーザーの取得: 認証は Step 9 で Better Auth に差し替える。このステップでは、ログイン中の
   ユーザーを返す関数を1か所に置き、APP_ENV が local かテストのときだけ開発用のヘッダー（例: X-Moonx-Dev-User-Id）
   から読む。この差し替え口は Step 9 のやることに記録してある
4. 結合テスト（Bun test ＋ DATABASE_URL_TEST の PostgreSQL。make test-api）: 全エンドポイントの正常系、
   7.1 の権限マトリクスの表駆動テスト（このステップのエンドポイント × ロール → 期待するステータス）、
   更新で変更履歴が1件ずつ増えること、楽観ロックの衝突、アーカイブ。テストでユーザーを切り替える方法は
   ヘルパー1つに集め、Step 9 でそのヘルパーだけを本物のセッションに替えれば済む形にする

まだ作らないもの: 認証と 5.4（Step 9）、自己分析・プラン・AI 往復（Step 7）、
決定ログ・コメント・履歴・通知・テンプレートの移行・運営者・定期実行（Step 8）。

シードの DB に対して curl でこのステップの各エンドポイントが期待どおりに応答し
（権限の無いロールは 403、無いものは 404、古い lockVersion は 409）、
make test-api が通り、make openapi で apps/api/openapi.json が書き出せる状態をゴールとする。
```

---

## Step 7: API: 自己分析・プラン・Pitch Deck・AI 往復

Status:

```
docs/02-01_system-design-doc.md の 5.8〜5.10・ADR-012 と、docs/design-spec.md 6.6（AI 書き出しの書式と設問 ID）・
6.7（AI 取り込み）・6.11（自己分析）・6.12〜6.14（プラン・実行管理・Pitch Deck）に従って実装してください。
Step 6 の基盤（認可・withHistory・楽観ロック・エラー・回数制限）をそのまま使う。

やること:
1. 自己分析: S1〜S7（本人だけ。self_analyses.user_id で絞る。共有は S5、メンバーの閲覧は共有済みのものだけ）
2. プラン: P1〜P11（M5 の下書きの作成での検証からの文章のコピーと実行管理の初期行、版の保存のスナップショット、
   Go / No-Go と決定ログ、実行管理）
3. Pitch Deck: packages/domain の buildPitchDeck()（画面と PDF が同じ素材を使う）、P12、
   P13（react-pdf。06 の semantic.print のフォントを読み込み、日本語を含む代替フォントの使った文字だけを埋め込む。常にライト）
4. AI 往復: packages/domain に書き出しの Markdown / JSON の生成と parseAiReply()・matchBlocks()、
   X1〜X3（X3 は1つでも古い lockVersion があれば何も変えずに 409 CONFLICT_MULTI。変更履歴の source は
   ai_import、batch_id で1回の操作をまとめる）
5. 回数制限（7.2）: PDF の作成と、AI 書き出し・取り込み
6. テスト: packages/domain（buildPitchDeck・書式の生成と解析）と結合テスト（全エンドポイントの正常系、
   このステップのエンドポイントの権限マトリクス、変更履歴、衝突、PDF が作れること（ページ数と文字の抽出））

curl で各エンドポイントが期待どおりに応答し、P13 で Piaya Gift Box Delivery の Plan A の1分版（8枚）と
5分版（12枚）の PDF がダウンロードでき、X1 で書き出した Markdown の回答を書き換えて X2・X3 で取り込めて、
make test-domain・make test-api が通る状態をゴールとする。
```

---

## Step 8: API: 決定ログ・コメント・履歴・通知・テンプレートの移行・運営者・定期実行

Status:

```
docs/02-01_system-design-doc.md の 5.11〜5.14・ADR-014 と、docs/design-spec.md 6.0.4（コメント）・
6.0.5（変更履歴）・6.0.7（テンプレートの移行）・6.13（期限の通知）・6.15（決定ログ・通知）・6.17（運営者）に
従って実装してください。

やること:
1. 決定ログ: L1・L2（追記だけ。更新・削除の API は作らない）
2. コメント: C1〜C3（返信は1段、メンション、解決と取り消し、自己分析へのコメントは共有先のワークスペースごと、
   行の削除で隠れる）
3. 変更履歴: H1〜H3（項目ごとと画面全体、この時点に戻す、削除の取り消し、batch 単位の戻し。戻すことも履歴に残す）
4. 通知: N1〜N3 と、通知を作るところ（メンション・自分の項目へのコメント・判定・期限）
5. テンプレートの移行: T1・T2（6.0.7 の表のとおり。batch で戻せる）
6. 運営者: AD1〜AD9（テンプレートの下書き・編集・検証・公開、ユーザー・ワークスペース・招待の一覧（中身は見せず
   件数と最終利用日だけ）、停止と再開、招待の発行）と make admin-create（登録の確認は Step 9）
7. 定期実行: Z3 /internal/cron/due-notifications（OIDC のトークンの発行者・audience・サービスアカウントを確かめる。
   local は make cron-due が処理を直接呼ぶ）。担当者のタイムゾーンで朝8時を過ぎた担当者について、期限の3日前・
   当日・期限切れの通知を作り、一意制約で二重に作らない
8. テスト: 全エンドポイントの正常系、このステップのエンドポイントの権限マトリクス、履歴から戻す、batch の戻し、
   テンプレートの移行と戻し、cron の重複防止

curl で各エンドポイントが期待どおりに応答し、make cron-due でデモデータの期限の通知が作られ
（もう一度動かしても増えない）、make admin-create で招待のリンクが表示され、
make test-api が通る状態をゴールとする。
```

---

## Step 9: 認証（Better Auth・招待制）

Status:

```
docs/02-01_system-design-doc.md の ADR-010・ADR-024・5.4・7.2（セッション・CSRF・レート制限・アップロード）と
docs/design-spec.md 6.16 に従って、Better Auth で認証を実装し、Step 6 の仮のユーザー取得を差し替えてください。

やること:
1. Better Auth（Drizzle アダプター、テーブルは SDD 6.3）を /api/auth/* にマウントし、5.4 の表のとおり設定する
   （メール＋パスワードと disableSignUp、Google と disableImplicitSignUp、databaseHooks（招待の確認・個人用
   ワークスペースの作成・停止の拒否）、パスワード再設定の後のセッション、セッション30日と Cookie、回数制限
   （rate_limits）、TRUSTED_ORIGINS、CF-Connecting-IP）。Expo プラグイン（スマホのセッション）
2. U1〜U8（招待の内容・招待からの新規登録・受諾・プロフィール・写真（sharp で 512×512 の WebP、メタデータを落とす。
   local は ./.data/avatars、staging / production は Cloud Storage）・アカウントの削除・パスワードの設定）
3. Step 6 のログイン中のユーザーの取得を Better Auth のセッションに差し替え、開発用のヘッダーを消す。
   停止・削除したユーザーの残ったリクエストは 401（7.1）
4. テストのユーザー切り替えのヘルパーを本物のセッションに替え、Step 6〜8 の結合テストがそのまま通ることを確かめる
5. 認証の結合テスト: 招待からの新規登録（メール＋パスワード、Google のフック）、招待なしの新規登録の拒否、
   招待と違うメール、停止、アカウントの削除（design-spec 6.16 の表）、パスワードの再設定（他のセッションを消す）、
   回数制限、写真の種類と大きさの検査
6. make admin-create で出した招待から登録したユーザーが運営者になることを確かめる

.env に GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が無くても API が起動し（Google ログインだけが使えない）、
デモのユーザーで curl のログイン（A1）から Cookie を受け取り、その Cookie で /api/v1/me が 200 を返し、
開発用のヘッダーだけのリクエストは 401 になり、make test-api が通る状態をゴールとする。
```

---

## Step 10: Web の部品（packages/ui-web）

Status:

```
docs/design-spec.md 4章（4.1 レイアウトパターン・4.3 レスポンシブ・4.4 ビジュアル・4.5 部品）と
docs/02-01_system-design-doc.md の ADR-018・ADR-025 に従って、packages/ui-web に Web の部品を作ってください。

やること:
1. テーマの適用: packages/ui-tokens の vanilla-extract のテーマ。<html data-theme> と prefers-color-scheme で
   ライト / ダーク、デスクトップは medium・タッチの端末は large のスケール。スタイルは semantic のトークンだけを参照する
2. design-spec 4.5 の全部品（独自の SideNav / TabBar・Panel・QuestionCard・Slide を含む）を
   React Aria Components ＋ vanilla-extract（recipe() で size・variant）で作る。名前と props は 4.5 の名前で、
   スマホと同じ props にする。状態は data-* 属性で書く。アイコンは lucide-react
3. Popover と Tray の切り替え（幅が semantic.breakpoint.tablet より狭いときに Tray）
4. レイアウトの部品（Flex・Grid など。間隔はトークンの名前だけを受け取る）と、4.1 のパターン A〜J の枠
   （デスクトップ / タブレット / モバイルの並び）
5. 確認用のページ（開発のときだけ開けるルート。本番のビルドに入れない）: 全部品の種類・大きさ・状態、ライト / ダーク
6. テスト（Vitest ＋ Testing Library ＋ @react-aria/test-utils。make test-web）: 部品ごとの種類・大きさ・状態
   （hover・pressed・focus-visible・disabled）、Popover と Tray の切り替え、キーボード操作、axe の検査

まだアプリの画面は作らない（Step 11 から）。

make dev で確認用のページに全部品が出て、ライト / ダークとスケールを切り替えても崩れず、
make test-web・make lint・make typecheck が通る状態をゴールとする。
```

---

## Step 11: Web のアプリの枠と認証・アカウントの画面

Status:

```
docs/02-01_system-design-doc.md の4章（ルーティング）・8.2（表示方針）・9章と、docs/design-spec.md の
5章・6.0.1（アプリの枠）・6.0.6（共通の状態表示）・6.16（認証とワークスペース）に従って、
Web のアプリの枠と、認証・アカウントの画面を作ってください。画面は packages/ui-web の部品だけで組む。

やること:
1. API クライアント: Eden Treaty（treaty<App>()）＋ TanStack Query（staleTime などは SDD 7.3）、
   X-Moonx-Client: web、エラーのコードからカタログの文言への対応（8.2）、401 は /login?next= へ
2. i18n の組み込み（packages/i18n。UI の文言はすべてカタログ）
3. ルーティング（SDD 4章のパス。TanStack Router のファイルルート）、認証の要るルートのガード、
   モーダルとパネルを検索パラメータで開く仕組み
4. アプリの枠（6.0.1）: サイドバー（デスクトップ）、アイコンだけのサイドバー（タブレット）、下のタブと More
   （モバイル）、パンくず、ヘッダーの保存状態とパネルの入口の置き場所、未読数（N2 を60秒ごと、画面が見えている間だけ）、
   運営者にだけ出す Admin のメニュー
5. 共通の状態表示（6.0.6）と、ブロックごとのエラーの境界（Ref は requestId の先頭8文字。Sentry に送る）
6. 画面: 1 ランディング（ビルド時にプリレンダー）、2 ログイン / 新規登録 / パスワード再設定、3 オンボーディング、
   4 アカウント設定（プロフィール・写真・パスワード・タイムゾーン・表示モード・所属と Leave・ログアウト・
   アカウントの削除）、M7 ワークスペース切替と新しいワークスペース
7. テスト（make test-web）: ガードとリダイレクト、エラーの表示の対応、フォームの検査

まだ作らないもの: 5 ダッシュボードの中身（Step 15。このステップではルートと枠だけ）、/privacy・/support（Step 26）。

デモのユーザーでログインすると最後に開いたワークスペースの /w/$workspaceId に移り、
make admin-create の招待のリンクから新規登録とオンボーディングが通り、M7 でワークスペースを作って切り替えられ、
未ログインで保護されたパスを開くと /login?next= に移り、4 でダークに切り替えると全体が切り替わり、
make test-web が通る状態をゴールとする。
```

---

## Step 12: Web のコア画面（1）: 共通の入力の仕組み・アイデア一覧・検証ホーム・設問フォーム

Status:

```
docs/design-spec.md 6.0.2〜6.0.5・6.1（13 検証ホーム）・6.2（11 設問フォーム）・6.8（6 アイデア一覧と M1）と、
docs/02-01_system-design-doc.md の ADR-019・ADR-021 に従って、コアフロー（design-spec 6章の冒頭）の前半を
Web で作ってください。

やること:
1. 自動保存と同時編集（6.0.2）: 入力が約1秒止まったとき・入力欄から離れたとき・画面を離れるときに保存、
   保存状態の表示、409 CONFLICT の確認（相手の内容を読み込む / 自分の内容で上書きする、捨てる前のコピー）、
   送信待ちの列（IndexedDB。ADR-021: 項目ごとの最新だけ、再接続で再送、401 は同じユーザーのときだけ再送、
   ログアウトで消す）、オフラインの表示
2. F/A/U の付け方と M2 根拠シート（6.0.3）
3. PNL-1 コメントパネルと PNL-2 変更履歴パネル（6.0.4・6.0.5。デスクトップは右のパネル、狭い幅はトレイ）
4. 6 アイデア一覧（絞り込み・並び・Drop を既定で隠す・複製・アーカイブ）と M1 新しいアイデア
5. 13 検証ホーム（概要・確認項目6つ・F/A/U の内訳・主要指標・Next steps・セクション一覧・判定の履歴・プラン一覧。
   数字と判定は packages/domain で計算する）
6. 11 設問フォームの検証の形（01 / 02 / 10。パターン C のフォーカス、キーボード操作、Focus スイッチ、
   表示条件（02 の OCEAN による出し分け））。自己分析の形は Step 15、プランの形は Step 16 で足す
7. Viewer には編集のボタンを出さない（design-spec 1.3）
8. テスト（make test-web）: 設問フォームのフォーカス、F/A/U のボタンと M2、自動保存と送信待ちの列、
   衝突の確認、権限による表示の出し分け

まだ作らないもの: 17〜19・24・25（Step 13）、14〜16（Step 14）。

Ana でログインし、6 から M1 でアイデアを作って 13 に移り、11 で回答して F/A/U と根拠を付けると
13 の確認項目・F/A/U の内訳・Next steps が変わり、別のブラウザで同じ回答を変えると衝突の確認が出て、
ネットワークを切って入力しても再接続で保存され、Grace（Viewer）では編集のボタンが出ず、
make test-web が通る状態をゴールとする。
```

---

## Step 13: Web のコア画面（2）: 費用・損益・判定・AI 往復

Status:

```
docs/design-spec.md 6.3（17 費用）・6.4（18 損益・シナリオ）・6.5（19 判定）・6.6（24 AI 書き出し）・
6.7（25 AI 取り込み）に従って、コアフローの後半を Web で作ってください。
Step 12 の自動保存・F/A/U・M2・パネルをそのまま使う。

やること:
1. 17 費用（パターン F。行の追加・削除・並べ替え、金額・価格の%・仮置きのまとめ額、F/A/U、合計と下限の表示）
2. 18 損益・シナリオ（入力のたびに packages/domain でその場で計算、未入力と 0 の区別、粗利のマイナスと
   Capacity 超過の警告、既定値の表示、結果をスクロールしても見える位置に固定）
3. 19 判定（判断材料、Proceed / Hold / Drop と理由、決定ログへの記録）。Proceed の後の M5 は Step 16 で作る
4. 24 AI 書き出し（範囲 → 確認 → 書き出し。Markdown / JSON、コピーとダウンロード）
5. 25 AI 取り込み（貼り付け → 振り分け → 差分確認 → 反映。409 CONFLICT_MULTI の扱い、反映の後は書き出し元へ戻る）。
   13 と 11 の Import from AI の入口
6. テスト（make test-web）: 費用のワークシートの合計、損益の表示、判定の記録、取り込みの振り分けと差分

Piaya Gift Box Delivery の 17・18 に design-spec 8.3 の期待値がそのまま出て、値を変えるとその場で再計算され、
Mobile Bike Repair で費用と損益を入れて 19 で判定を記録すると 13 の判定の履歴に残り、
24 で書き出した Markdown の回答を書き換えて 25 で取り込むと差分が出て反映され、
make test-web が通る状態をゴールとする。
```

---

## Step 14: Web の残りの画面（1）: 調査ログ・競合・前提とリスク・ワークスペース設定・ユーザーの管理

Status:

```
docs/design-spec.md 6.10（14 調査ログ・15 競合・代替・16 前提・リスク）・6.16（9 ワークスペース設定）・
6.17（28 管理: ユーザーとワークスペース）に従って、PRD 4章の Must のうち残っている画面を Web で作ってください。
Step 12 の自動保存・F/A/U・M2・パネルをそのまま使う。

やること:
1. 14 調査ログ（パターン D。絞り込み、裏付ける確認項目のタグ、根拠に使われている調査ログの削除の確認（6.0.3））
2. 15 競合・代替（パターン E。カードと表の切り替え、生き残り / 失敗のパターンの設問）
3. 16 前提・リスク（パターン D。Assumptions / Risks のタブ、リスクの自動の並び）
4. 14〜18 と 11 のヘッダーのセクション切替（design-spec 5章「検証の中の移動」）
5. 9 ワークスペース設定（名前・通貨・ロールの変更と削除・招待の送信 / リンクのコピー / 再送 / 取り消し。
   外れたときと降格したときの扱いは 6.16 の表）
6. 28 管理: ユーザーとワークスペース（3つのタブ、利用状況は件数と最終利用日だけ、停止と再開、招待の発行）
7. テスト（make test-web）

13 の確認項目と Next steps から 14〜16 に移って入力すると 13 の状態が変わり、
Ana（Owner）が 9 から招待を送ると API のログにリンクが出て、そのリンクから新規登録でき、
Moonx Admin が 28 で招待の発行とユーザーの停止・再開ができ、make test-web が通る状態をゴールとする。
```

---

## Step 15: Web の残りの画面（2）: ダッシュボード・決定ログ・通知・自己分析

Status:

```
docs/design-spec.md 6.9（5 ダッシュボード）・6.15（7 決定ログ・8 通知）・6.11（10 自己分析ホーム・
12 メンバーの自己分析）・3.8（M6）・6.2（11 設問フォーム）に従って、Web で作ってください。

やること:
1. 5 ダッシュボード（4つのブロックを個別に読み込む、ロールによる出し分け、Getting started の空の状態）
2. 7 決定ログ（絞り込み、スナップショットの詳細、13 / 20 への移動）
3. 8 通知（未読の絞り込み、既読、該当の項目へ移動（コメントならパネルを開く）、権限を失った通知の表示）
4. 10 自己分析ホーム（11セクションの進み具合、完了と再開、M6 共有先の選択、Team への入口、AI 書き出しと取り込みの入口）
5. 11 設問フォームの自己分析の形（F/A/U なし、金額と理由の設問）
6. 12 メンバーの自己分析（共有済みのものだけ読める、共有先のワークスペースごとのコメント）
7. Viewer として開いているワークスペースでは、自己分析のタブと 12 への入口を出さない（design-spec 5章）
8. テスト（make test-web）

Ana でログインすると 5 の4つのブロックがデモデータどおりに出て、Ana の 12 で共有済みの Paolo の自己分析が
読めてコメントでき、共有していない Kenji は名前だけが出て、Kenji でログインすると未読の通知からメンションの
コメントのパネルが開き、
Grace（Viewer）には自己分析のタブが出ず、make test-web が通る状態をゴールとする。
```

---

## Step 16: Web の残りの画面（3）: プラン・実行管理・Pitch Deck

Status:

```
docs/design-spec.md 6.12（20 プランホーム・21 プラン項目の編集・M3・M4・M5）・6.13（22 実行管理）・
6.14（23 Pitch Deck）に従って、Web で作ってください。

やること:
1. M5 プラン下書きの作成（19 の Proceed の直後、13 / 20 の Add plan から。名前の重複の表示）
2. 20 プランホーム（Part A / B の30項目の進み具合、検証から引き継いだ数字（参照だけ。Edit in validation）、
   版の一覧と読み取り専用の表示、Go / No-Go、Latest decision の表示）
3. 21 プラン項目の編集（11 と同じ部品。検証のデータと共有された自己分析の参照、表の設問、linked_metric と
   execution_view の設問）
4. M3 版の保存と M4 Go / No-Go の記録（決定ログに残す）
5. 22 実行管理（5つのタブ、担当・期限・状態、並べ替え、期限切れの表示）
6. 23 Pitch Deck（パターン I。1分版 / 5分版、版の選択、PDF のダウンロード（P13）。スライドは直接編集しない）
7. テスト（make test-web）

Piaya Gift Box Delivery の Plan A で 20〜23 がデモデータどおりに出て、21 の数字の横の Edit in validation から
17 / 18 に移り、Mobile Bike Repair を Proceed にして M5 から下書きを作り、版の保存と Go / No-Go を記録すると
7 決定ログに残り、23 の PDF がダウンロードでき、make test-web が通る状態をゴールとする。
```

---

## Step 17: Web の残りの画面（4）: テンプレートの改訂と移行

Status:

```
docs/design-spec.md 6.17（26 管理: テンプレート一覧・27 管理: テンプレート編集）と 6.0.7（M8 テンプレートの移行）に
従って、Web で作ってください。

やること:
1. 26 テンプレート一覧（3種類のテンプレートと版の一覧、下書きの作成）
2. 27 テンプレート編集（パターン D のツリー。セクションと設問・EXAMPLE・ヒント・表示条件・確認項目の基準値・
   費用行と実行管理の初期行・AI 用プロンプト、検証と公開、公開済みの版は読み取り専用）
3. M8 テンプレートの移行（10 / 13 / 20 のヘッダーの A newer template is available、引き継げない回答の事前の一覧、
   履歴からまとめて戻す）
4. テスト（make test-web）

Moonx Admin が検証の v3 の下書きを 27 で直して公開すると、Piaya Gift Box Delivery の 13 に移行の案内が出て、
M8 で移行でき、13 の履歴の「Template updated to v3」から元に戻せ、make test-web が通る状態をゴールとする。
```

---

## Step 18: スマホの部品（packages/ui-native）と開発ビルド

Status:

```
docs/design-spec.md 4章（4.1・4.3・4.4・4.5 の「スマホでの振る舞い」）と docs/02-01_system-design-doc.md の
ADR-003・ADR-018・ADR-025 に従って、packages/ui-native にスマホの部品を作り、開発ビルドを用意してください。

やること:
1. 開発ビルド（EAS の profile development）の設定。{APP_ID} が SDD 2章で未確定なら、ユーザーに決めてもらい
   （ストアに出した後は変えられない）、SDD 2章の表と使っている箇所を置き換えてから設定する。
   EAS のアカウントでのビルドはユーザーと一緒に行う（docs/03_dev-setup.md 3.5）
2. Unistyles v3 のテーマ（packages/ui-tokens の生成物。ライト / ダーク・ブレークポイント・large のスケール）。
   テーマは 4 アカウント設定の System / Light / Dark に従う
3. design-spec 4.5 の全部品を、Web と同じ名前と props で作る（@rn-primitives・@gorhom/bottom-sheet・
   Unistyles の variants・lucide-react-native、React Native のアクセシビリティの属性）。ポップオーバーはトレイにし、
   @rn-primitives に無い NumberField・DatePicker・ComboBox などは自作する（ADR-025）
4. レイアウトの部品（トークンの名前だけを受け取る）と、4.1 のパターンのスマホの並び（主要な操作の下部固定、
   キーボードで入力欄と保存状態が隠れないこと（4.3））
5. 確認用の画面（開発ビルドのときだけ開けるルート）
6. テスト（Jest（jest-expo）＋ React Native Testing Library。make test-mobile）: 種類・大きさ・
   アクセシビリティの属性、トレイの開閉

make test-mobile・make lint・make typecheck が通り、
開発ビルドを入れた端末かエミュレーターで、確認用の画面に全部品が出て、ライト / ダークを切り替えても崩れない
（端末での確認はユーザーと一緒に行う）状態をゴールとする。
```

---

## Step 19: スマホのアプリの枠と認証・アカウントの画面

Status:

```
Step 11 と同じ範囲を、docs/02-01_system-design-doc.md の ADR-003・ADR-010・4章（ディープリンク）に従って
スマホで作ってください。画面の仕様は design-spec が正。画面は packages/ui-native の部品だけで組む。

やること:
1. API クライアント: Eden Treaty ＋ TanStack Query、EXPO_PUBLIC_API_BASE_URL、X-Moonx-Client: ios / android と
   X-Moonx-App-Version、Better Auth の Expo プラグイン（SecureStore）、426 の「Update moonx to continue」
2. i18n の組み込み
3. ルーティング（Expo Router。パスは Web と同じ）、ディープリンク（moonx:// / moonx-staging://、Universal Links と
   App Links の設定。配るファイルは Step 26 で作る）
4. アプリの枠（6.0.1 のスマホ: 戻る・画面名・コメントと履歴の入口、下のタブと More、主要な操作の下部固定）、
   未読数（アプリが前面に戻ったとき・60秒ごと）
5. 共通の状態表示（6.0.6）とエラーの境界、Sentry（EXPO_PUBLIC_SENTRY_DSN）
6. 画面: 1・2・3・4（写真は端末のライブラリかカメラから）・M7。Google ログインはシステムのブラウザで行い
   アプリのスキームで戻る（local では確かめられないので、staging で確かめる。ADR-010）
7. テスト（make test-mobile）: セッションの保存、ガード

開発ビルドでデモのユーザーにメール＋パスワードでログインし、アプリを再起動してもログインが続き、
招待のリンク（moonx://invite/...）から新規登録とオンボーディングが通り、M7 でワークスペースを切り替えられ、
make test-mobile が通る状態をゴールとする。
```

---

## Step 20: スマホのコア画面（1）: 共通の入力の仕組み・アイデア一覧・検証ホーム・設問フォーム

Status:

```
Step 12 と同じ範囲（design-spec 6.0.2〜6.0.5・6 と M1・13・11 の検証の形）を、スマホで作ってください。
画面の仕様は design-spec が正で、スマホの形は 4.1（パターン A・C・D のスマホの列）と 4.3 に従う。

スマホで違うところ:
1. 送信待ちの列は expo-sqlite（ADR-021）。再接続したとき・アプリが前面に戻ったときに再送する
2. 11 は1画面に1問のカード。前後の移動は下部に固定し、キーボードで入力欄と保存状態が隠れない
3. M1・M2・パネル・確認はボトムシートか全画面シート
4. 13 は縦に積む（要約 → Next steps → 状態 → 入口の一覧 → 履歴）。主要な操作は下部に固定
5. 6 はリストを全画面で出し、開くと詳細を全画面で出す

テスト（make test-mobile）: 1問ずつのカード、自動保存と送信待ちの列、衝突の確認、権限による表示の出し分け。

開発ビルドで Step 12 のゴールと同じ流れ（M1 でアイデアを作る → 回答と F/A/U と根拠 → 13 が変わる →
衝突の確認 → 機内モードで入力して戻すと保存される → Viewer に編集のボタンが出ない）が通り、
スマホで入れた回答を Web で開くと続きが見え（PRD MB-09）、make test-mobile が通る状態をゴールとする。
```

---

## Step 21: スマホのコア画面（2）: 費用・損益・判定・AI 往復

Status:

```
Step 13 と同じ範囲（design-spec 6.3〜6.7: 17・18・19・24・25）を、スマホで作ってください。
画面の仕様は design-spec が正で、スマホの形は 4.1（パターン B・F・G のスマホの列）と 4.3 に従う。

スマホで違うところ:
1. 17・18 は入力を行ごとのカードにし、1行の編集はシートで行う。下部に結果の要約バーを固定し、タップで結果の全体を開く。
   表を横にスクロールさせない
2. 19 は判断材料を上、入力を下にした1カラム。記録のボタンは下部に固定
3. 24 は書き出しをコピーと端末の共有で渡す。25 は貼り付けから始め、差分は上下に並べる

テスト（make test-mobile）: 費用のカードの合計、損益の要約バー、判定の記録、取り込みの差分。

開発ビルドで Step 13 のゴールと同じ流れ（Piaya の 17・18 に 8.3 の期待値が出る → Bike Repair で費用と損益を入れて判定を
記録する → 24 で書き出して 25 で取り込む）が通り、make test-mobile が通る状態をゴールとする。
```

---

## Step 22: スマホの残りの画面（1）: 調査ログ・競合・前提とリスク・ワークスペース設定・ユーザーの管理

Status:

```
Step 14 と同じ画面（14・15・16・9・28）を、スマホで作ってください。画面の仕様は design-spec が正で、
スマホの形は 4.1（パターン D・E・H のスマホの列）と 4.3 に従う。

スマホで違うところ:
1. パターン D はリストを全画面で出し、項目を開くと詳細を全画面で出す。編集はボトムシート
2. 15 はカードを1列に並べ、比較の表は出さない
3. 16・28 のタブは横にスクロールできるタブ

テスト（make test-mobile）。

開発ビルドで Step 14 のゴールと同じ流れが通り、make test-mobile が通る状態をゴールとする。
```

---

## Step 23: スマホの残りの画面（2）: ダッシュボード・決定ログ・通知・自己分析

Status:

```
Step 15 と同じ画面（5・7・8・10・11 の自己分析の形・12・M6）を、スマホで作ってください。
画面の仕様は design-spec が正で、スマホの形は 4.1（パターン A・C・D のスマホの列）と 4.3 に従う。

スマホで違うところ:
1. 5・10 は縦に積む
2. 7・8・12 はリストを全画面で出し、開くと詳細を全画面で出す
3. 自己分析の設問は1問ずつのカード（PRD SF-01: スマホで答えて続きを Web で開く）

テスト（make test-mobile）。

開発ビルドで Step 15 のゴールと同じ流れが通り、スマホで答えた自己分析の続きを Web で開けて、
make test-mobile が通る状態をゴールとする。
```

---

## Step 24: スマホの残りの画面（3）: プラン・実行管理・Pitch Deck

Status:

```
Step 16 と同じ画面（M5・20・21・M3・M4・22・23）を、スマホで作ってください。画面の仕様は design-spec が正で、
スマホの形は 4.1（パターン A・C・D・I のスマホの列）と 4.3 に従う。

スマホで違うところ:
1. 21 は1問ずつのカード、表の設問は行ごとのカードとシートでの編集
2. 22 はタブを横にスクロールでき、項目の編集はボトムシート
3. 23 はスライドを幅に合わせて縦に並べ、PDF は API から受け取って expo-sharing で共有する（ADR-003）

テスト（make test-mobile）。

開発ビルドで Step 16 のゴールと同じ流れが通り、23 の PDF を端末の共有で渡せて、
make test-mobile が通る状態をゴールとする。
```

---

## Step 25: スマホの残りの画面（4）: テンプレートの改訂と移行

Status:

```
Step 17 と同じ画面（26・27・M8）を、スマホで作ってください。画面の仕様は design-spec が正で、
スマホの形は 4.1（パターン D のスマホの列。27 のツリーは全画面のリスト）と 4.3 に従う。

テスト（make test-mobile）。

開発ビルドで Step 17 のゴールと同じ流れが通り、make test-mobile が通る状態をゴールとする。
```

---

## Step 26: インフラ + CI/CD

Status:

```
docs/02-01_system-design-doc.md の2章（インフラ管理・環境と命名・環境変数・CI のシークレットと変数）・7.2・11章、
ADR-004・ADR-007・ADR-015・ADR-016・ADR-027・ADR-028 と、docs/04_deployment-procedure.md・
docs/03_dev-setup.md 5章に従って、インフラと CI/CD を作ってください。
本番の資格情報はこのセッションに渡さない。クラウドへの適用（apply）と最初のデプロイは、
docs/03_dev-setup.md 5.4 の手順でユーザーが行う。

やること:
1. 未確定の名前（{DOMAIN}・{GCP_PROJECT_ID}）をユーザーに決めてもらい、SDD 2章の表と使っている箇所を置き換える
2. apps/api/Dockerfile（oven/bun。sharp と PDF のフォントが動くこと）
3. infra/terraform の modules/ と envs/{shared,staging,production}/: 2章「インフラ管理」の資源、tfstate のバケット、
   bootstrap の変数、Cloud Run の image の ignore_changes、CRON_OIDC_AUDIENCE の組み立て、
   Monitoring のアラート（SDD 11章の閾値）、予算アラート、Cloudflare のゾーンの設定
4. apps/web/worker/index.ts（/api/* の転送、X-Moonx-Proxy-Secret・CF-Connecting-IP・X-Request-Id の付与、
   届かないときは UPSTREAM_UNAVAILABLE の形）と wrangler.jsonc（env staging / production、observability）
5. apps/web/public/: _headers（7.2 のセキュリティヘッダー、apple-app-site-association の Content-Type）、
   /.well-known/apple-app-site-association と assetlinks.json、robots.txt、/privacy と /support
   （文面はユーザーに用意してもらう。無ければ Status を blocked にして理由を書く）
6. apps/mobile/eas.json（profile development / staging / production、チャンネル、runtimeVersion は fingerprint）と
   app.config.ts の環境ごとの設定
7. .github/workflows/ の ci.yml・build.yml・deploy.yml・db-backup.yml（04 2章のとおり make のターゲットを呼ぶ）、
   Dependabot、deploy/staging/version と deploy/production/version
8. Makefile のデプロイ系のターゲット（build-web・build-api-image・deploy-api・deploy-web・mobile-update・
   mobile-build・infra-plan・infra-apply・db-backup）を、ここで作った対象に合わせて確かめる

docker build した API のイメージがローカルで起動して /api/health と P13 の PDF が動き、
3つの env で terraform validate が通り、両方の env で wrangler deploy --dry-run が通り、
ワークフローの構文の検査（actionlint）が通り、make build-web ENV=staging が通る状態をゴールとする。
```

---

## Step 27: テスト + 仕上げ

Status:

```
docs/02-01_system-design-doc.md の10章（テスト戦略）・11章（KPI）と docs/01_prd.md 5章に従って、
テストと品質を仕上げてください。

やること:
1. E2E（Playwright。e2e/。make test-e2e。e2e/playwright.config.ts の webServer で、DATABASE_URL_TEST の DB に対して API と Web を起動する）: コアフロー（アイデアの作成 → 回答と根拠 → 費用 → 損益 → 判定 →
   プラン下書き → 版の保存 → Go / No-Go → Pitch Deck の PDF）の Happy Path を1本。コアフローの E2E は
   **受入スイート**を兼ねる。「同じことができる」の判定基準になるため、実装の内部でなく仕様の振る舞いで書く。
   加えて、招待からの新規登録、Viewer の読み取り専用、AI 書き出し → 取り込み、アカウントの削除、
   異常系の最低ライン（不正入力のエラー形式・未認証アクセスの拒否・空の状態の表示）。主要な画面で axe の検査
2. カバレッジを SDD 10章の目標（domain 行 95%・api 分岐 80%・web 60%・mobile 50%）と比べ、足りない所にテストを足す。
   7.1 の権限マトリクスの全エンドポイント × ロールが表駆動テストにあることを確かめる
3. スマホの E2E: Maestro を入れるかをユーザーと決め（ADR-001・SDD 10章）、決めた内容を SDD 10章に書く。
   入れるならコアフローを1本書く
4. KPI の計測: packages/db/queries/kpi.sql（SDD 11章）。docs/01_prd.md 5章の指標のうちアプリのデータから数えられるものを、
   件数と割合だけで数える（回答の中身は読まない）
5. README.md（リポジトリの直下）: docs/ への入口と make setup からの始め方。中身は docs への参照にし、書き写さない
6. CI と同じ順（04 2章の ci.yml）で全ターゲットを通す

make lint・make typecheck・make test・make build・make test-e2e がすべて通り、
kpi.sql をデモデータに対して実行して件数が返る状態をゴールとする。
```
