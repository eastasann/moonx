# moonx — Claude Code プロンプト集

Claude Code のチャットに1つずつコピペして使う（`/draft:implement` はこのファイルを読んで1ステップずつ実行する）。
前のステップが完了・動作確認できてから次を投げること。
このファイルは派生物。docs/ のソース層から再生成でき、docs/ と食い違ったら docs/ が正。

このプロンプト集の範囲は、初期リリースの Web（スマホでは PWA）。ネイティブのアプリは含まない（PRD 6章のとおり、Web のデザインが固まったあとに /draft:feature で作る）。

ステップは5つの段階に分け、この順に進める（2026-10-11・2026-10-12 のユーザーの決定）:

1. Web（Step 1〜35）: 骨格 → DB → 共有のロジック → トークン・テンプレート・シード → API → 部品 → 画面。API は画面より先に全部作る。
   画面は PRD 4章の優先度に合わせ、Must（Step 23〜31）→ Should（Step 32〜34）→ Could（Step 35）の順に作る。
   画面は1つずつまとめて作るので、Must の画面にある Should や Could の操作も、その画面のステップで作る。
   5 ダッシュボード（Should）と 1 ランディング（Could）は、ログインとログアウトの行き先なので Must の段階で作る
2. PWA（Step 36）
3. 仕上げ（Step 37〜39）: 受入スイート・カバレッジ・docs との突き合わせ。公開の前に行う
4. インフラと CI/CD（Step 40〜41）
5. 公開（Step 42〜44）: 29・30 の本文（BCDX が用意する）と、人の操作（アカウント・課金・DNS・承認）が要る。無人ループはここで止まる。
   29 プライバシーポリシーと 30 サポートは本文が無いと作れないので、画面の段階ではなくここ（Step 42）で作る

**チャット分割の目安:** 1ステップ = 1チャット。どのステップも、読む docs が1チャットに余裕を持って収まる大きさにしてある（プロトタイプでは、大きすぎるステップで仕様が劣化した）。

**どのステップにも共通の決まり:**

- 各プロンプトの最後の3行: 参照した docs と実装を突き合わせ、仕様を弱める変更を自分で決めず、自分で決めたことをすべて報告する（CLAUDE.md の Implementation Rules と docs/03_dev-setup.md 1章「実装のエージェントの決まり」。プロトタイプでは、無人ループが報告しないまま仕様を弱め、docs を実装に合わせて書き換えた）
- まだ無い画面への遷移: 遷移先の画面を作るステップが、screen_flow.mermaid と design-spec 5章（共通のナビ）・6.1（Next steps の押した先）・6.15（7 と 8 の押した先）でその画面に入る遷移を調べ、すでにある画面からの入口（リンク・ボタン・メニュー）をつなぐ。遷移先ができるまで、遷移元には入口もルートも置かない
- ブラウザでの確認: Step 19 からは Playwright の E2E（e2e/）で確かめ、各ステップのゴールの確認を make test-e2e に入れる（無人ループでも確かめられるように）。E2E の土台は、Step 19 が Web だけで動く形で作り、Step 23 が API・DB・シードを足す
- 手元で確かめられない外部の経路（本物の Google ログイン・Resend・Cloud Storage・Sentry への送信）: そのステップでは差し替えた相手（テスト用のフックやサーバー）で確かめ、本物は Step 43 の staging で確かめる
- シード（design-spec 8章）: Step 6 で入れる。後の API のステップは、自分の対象の行がそのステップの処理の書く形と同じかを確かめ、違えばシードを直す

---

各Stepの見出し直下の `Status:` 行が進捗の記録先。値は次の3つで、無人ループの停止判定にも使われる:

- 空欄: 未着手
- `done YYYY-MM-DD`: 動作確認まで完了
- `blocked YYYY-MM-DD`: 着手したが、人の判断なしには閉じられない。直後の1行に閉じられない理由を具体的に書く

/draft:prep を再実行して作り直すときは、この行（とブロッカーの理由行）と追記されたステップを新版へ移送する。

## Step 1: モノレポ骨格と開発環境

Status: done 2026-10-12

```
docs/02-01_system-design-doc.md の2章（リポジトリ構成・環境と命名・環境変数・make ターゲット）と
ADR-017・ADR-022・ADR-025・ADR-030、docs/03_dev-setup.md の1章・3章・7章・10章に従って、
モノレポの骨格と開発環境を作ってください。

やること:
1. Bun workspaces のルート package.json（apps/*・packages/*、パッケージ名は @moonx/*）、共通の tsconfig、
   .gitignore（.env を除外。packages/ui-tokens/src/generated/ と apps/api/openapi.json はコミットする）
2. apps/api: ElysiaJS（Bun）。/api/health（SDD 5.14 の Z1。DB に触れず、version と env を返す）。
   起動時に環境変数を SDD 2章「環境変数」のとおり検査する（APP_ENV は必須で、無い値・知らない値では起動しない）
3. apps/web: TanStack Start の SPA モード（ADR-002）。Vite の /api を http://localhost:3000 へ転送し、
   envDir はリポジトリの直下。vanilla-extract の Vite プラグインを組み込む
4. packages/domain・schemas・db・i18n・ui-tokens・ui-web: package.json・tsconfig・入口の index.ts
   （中身は後のステップ。.gitkeep は置かない）
5. docker-compose.yml: PostgreSQL 17（localhost:5432）。docker/ の初期化 SQL で開発用の DB moonx と
   テスト用の DB moonx_test を作る
6. .env.example（直下）: SDD 2章「環境変数」の local の値
7. Biome（リントと整形）。画面にスタイルを書かない決まり（ADR-025）: apps/web の画面での
   @vanilla-extract/css の import を noRestrictedImports で禁止する。style 属性に値を書くことと
   JSX の中の生の文字列（SDD 9章）は scripts/check-screens.ts で見つけ、make lint から呼ぶ（スクリプトにもテストを書く）
8. テストの土台（ADR-022）: Bun test（domain・schemas・i18n・ui-tokens・scripts・db・api）、
   Vitest ＋ Testing Library（web・ui-web）。対象があるもの（/api/health、Web のルートの描画）にテストを書く。
   中身がまだ無いパッケージで make test-* が失敗しない設定にする（空のテストは書かない）。
   Playwright（@playwright/test）を開発の依存に入れる（make setup がブラウザを取ってくるため。E2E の土台は Step 19・23）
9. Makefile: SDD 2章「make ターゲット」の全ターゲットを、実コマンドへの薄い委譲として定義する。
   直下の .env を読み込んで各コマンドに渡す。以後の操作はすべて make 経由で行う。
   doc-lint は scripts/doc-lint.sh --docs を呼び、setup は git config core.hooksPath .githooks を含める
   （scripts/doc-lint.sh と .githooks/pre-commit は Phase 4 で配置済み）。
   対象を後のステップで作るターゲット（シード・トークン・Terraform・Dockerfile・昇格など）も SDD のとおりの
   実コマンドで書き、動くことはその対象を作るステップで確かめる（どのターゲットをどのステップが確かめるかを完了報告に書く）。
   make setup のうち .env の作成（.env.example のコピーと BETTER_AUTH_SECRET の乱数）はこのステップで動く形にし、
   それで手元の .env を作る。make test-api のテスト用の DB の作り直しは、この時点では空の DB を作り直すところまで動けばよい

まだ DB のスキーマ・画面・部品・認証・インフラは作らない。

make install と make db-up が通り、make dev で API と Web が起動して
curl http://localhost:3000/api/health と curl http://localhost:5173/api/health がどちらも 200 を返し、
make dev-api と make dev-web がそれぞれ単独でも起動し、make db-down で止まり、
make lint・make format・make typecheck・make test・make doc-lint が通る状態をゴールとする。
make setup の通しの確認は Step 6 で行う（シードとトークンの生成がまだ無いため）。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 2: DB スキーマとマイグレーション

Status: done 2026-10-12

```
docs/02-01_system-design-doc.md の6章（データモデル）・7.3（接続）・2章（DATABASE_URL_TEST の決まり・make ターゲットの
db-check）と ADR-008・ADR-009、docs/04_deployment-procedure.md 4.1（expand / contract）に従って、
DB のスキーマとマイグレーションを作ってください。

やること:
1. drizzle-orm を安定版の 0.45 系に、drizzle-kit をそれに合う版に固定する（ADR-009）
2. packages/db/src/schema.ts: 6.3 の Drizzle のスキーマを、全テーブル・列挙・check 制約・インデックスまで写す。
   6.3 が正。写している途中で記述の食い違いや欠けに気づいたら、写す前に 6.3 を直す（CLAUDE.md と /draft:implement の決まり。弱める直しになるなら止める）
3. packages/db/src/relations.ts（外部キーと同じ対応の relations()）
4. drizzle.config.ts と DB の接続モジュール（postgres.js、casing: "snake_case"。プールの設定は SDD 7.3）。
   drizzle.config.ts は DATABASE_URL を読む（make db-migrate は DATABASE_URL_DIRECT があればそれを DATABASE_URL に入れて渡す。Step 1 の Makefile）
5. make db-generate で最初のマイグレーションを作り、SQL を読んで 6.3 と合っているか確かめる
   （check 制約・一意制約・インデックスが入っていること）
6. make db-migrate で開発用の DB に当てる。テスト用の DB（DATABASE_URL_TEST）を作り直して当てる処理を、
   make test-api から使える形で用意する。DB の名前が _test で終わらない・URL にクエリ文字列があるときは作り直さない（SDD 2章）
7. make db-check（scripts/ に TypeScript で）: テストは一時的な Git のリポジトリで、既にあるマイグレーションの書き換え・削除、
   journal の行の書き換え・削除、BASE の最後の行より古い when と同じ when を、それぞれ失敗にすること、
   BASE に journal が無いとき（最初のマイグレーション）の扱いが SDD のとおりであることを確かめる

まだシード（Step 6）と API は作らない。

make db-generate → make db-migrate が通り、make db-studio が起動して 6.3 のテーブルが見え、テストで 6.3 の全テーブル・制約・インデックスがあることを確かめ、
テスト用の DB にも同じマイグレーションが当たり、db-check のテストが上の失敗の場合をすべて捕まえ、
make test・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 3: 計算と判定・共通の型・書式（packages/domain・schemas・i18n）

Status: done 2026-10-13

```
Web と API が同じコードを使う共有パッケージを作ってください（ADR-001）。

参照:
- docs/design-spec.md 1.2（書式: 相対の時刻・年の省略・負の金額・期限）・1.4（用語）・6.0.3（F/A/U の状態）・
  6.0.8（入力の規則）・6.1（確認項目の自動判定と Next steps）・6.4（計算と主要指標・書式）・8.3（検算用データ）
- docs/02-01_system-design-doc.md 5.1（共通の決まり）・5.2（共通の型）・6.3 の末尾（buildKeyMetrics() など保存する
  スナップショットを作る関数）・6.4（保存しないもの）・8.1（エラーコード）・9章（i18n）・10章（テスト）

やること:
1. packages/domain（純粋関数。DB にもフレームワークにも依存しない。入出力の型は SDD 5.2 に合わせる）:
   - 損益の計算（下限と上限・Unknown・未入力・既定値の使用・警告を含む）と主要指標（buildKeyMetrics()）
   - 確認項目6つの判定（基準値はテンプレートから引数で受け取る）と Next steps
   - F/A/U の状態と内訳、工程（Stage）の決定
2. packages/schemas: SDD 5.2 の共通の型の Zod v4 スキーマ、design-spec 6.0.8 の入力の規則、
   8.1 のエラーコードの一覧。エンドポイントごとの入出力のスキーマは、そのエンドポイントを作るステップで足す
3. packages/i18n: i18next の初期化（Web と API で共有）、locales/en/ のカタログの置き方（SDD 9章）、
   書式関数（en-PH。金額・件数・率・日付・時刻。design-spec 1.2 と 6.4）
4. テスト（Bun test。make test-domain）: 8.3 の検算データが期待値どおりになる固定のテスト、下限・上限の伝播、
   端数、確認項目6つの全状態、Next steps の優先順、F/A/U の状態と内訳、工程、スキーマの境界値、書式

まだ作らないもの: Pitch Deck の組み立て（Step 15）、AI 書き出し・取り込みの書式（Step 16）。

make test-domain が通り、8.3 の期待値（損益分岐 180.1件/月・6.9件/日、Expected の営業利益 ₱18,490、
回収 9.2か月、単純 ROI 130.9% など、表のすべての行）をテストが再現し、packages/domain の行カバレッジが
95% 以上で、make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 4: デザイントークンの生成（packages/ui-tokens）

Status: done 2026-10-14

```
docs/06_design-tokens.json から、Web と PDF のテーマと PWA のアイコン・マニフェストを生成する仕組みを作ってください。

参照:
- docs/06_design-tokens.json（正）
- docs/design-spec.md 1.2（サービス名。マニフェストの名前）・4.4（ビジュアルの方針・アプリのアイコン）
- docs/02-01_system-design-doc.md ADR-018・ADR-025（生成物と手で書くファイルの分け方）・ADR-031（マニフェストとアイコンの作り方）・
  10章（デザイントークンの行）

やること:
1. make tokens: 06 を読み、packages/ui-tokens/src/generated/ に次を作る
   - vanilla-extract のテーマ（ライトとダーク。semantic 層だけを公開する）
   - react-pdf 用のテーマ（semantic.print）
   - PWA のマニフェストとアイコン（SVG と、sharp で作る PNG。ADR-031 の一覧）
2. packages/ui-tokens/src/types.ts（手で書く。ADR-025）
3. 検査（make tokens と make test-domain）: エイリアスの参照先が実在し循環しないこと、semantic がエイリアスだけで
   あること、意味色のコントラスト（WCAG AA。検査の対象に無い色の組が増えたら失敗）、生成物が 06 と一致すること、
   Web のテーマが vanilla-extract でコンパイルできること、types.ts の値が 06 と合っていること
4. CI が「make tokens で差分が出たら失敗」できる形にする（ADR-018。CI 自体は Step 41）

まだ部品（Step 19〜22）と Service Worker（Step 36）は作らない。

make tokens が通って生成物ができ、もう一度動かしても差分が出ず、make test-domain・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 5: テンプレートのファイルと、取り込み・公開の処理

Status: done 2026-10-14

```
BCDX のテンプレートのファイルと、それを DB に取り込んで公開する処理を作ってください。取り込みと公開の処理は、
運営者の API（AD6・AD10。Step 18）とシード（Step 6）が同じものを使う。

参照:
- docs/02-01_system-design-doc.md 5.13（テンプレートのファイル AD10 の書式と、そのスキーマの置き場所・取り込みの決まり・
  AD6 の公開前の検査と公開）・6章
- docs/design-spec.md 6.0.7（テンプレートの版）・6.0.8（27 の入力の規則）・6.3（費用の初期行）・6.11〜6.13（自己分析・
  プランの小項目と表の列・実行管理の初期行）・6.17（ファイルの取り込みの拒み方）・9.1・9.3
- docs/drive-templates/（Drive の原本の写し。転記の元）

やること:
1. テンプレートのファイルの Zod スキーマ（packages/schemas。SDD 5.13）
2. data/templates/bcdx/self-analysis.json・plan.json（validation.json は Step 5b に分けた）: docs/drive-templates/ から、
   AD10 の書式で転記する。設問・Example・ヒント・小見出しとガイダンス・実行管理の初期行・
   AI 用プロンプト（自己分析だけ）を、原本の文面のまま写す（確認項目の基準値と費用の初期行は検証のファイルなので Step 5b）。
   design-spec が決めた構成（6.12・6.13 の小項目・表の列・初期行）と
   原本が食い違う所は、どちらを正にするかが仕様の決定なので、写す前に止める（無人ループでは blocked と理由）
3. packages/db: ファイルを検査して下書きの版を作る取り込みの処理、公開の前の検査（AD6 validate）、公開（AD6 publish）
4. テスト（make test-api。packages/db のテストは DATABASE_URL_TEST の DB を使う）: 2つのファイルが書式どおりで
   取り込めること、AD6 の検査を通って公開できること、書式の誤り（種類違い・読めない内容）を design-spec 6.17 のとおりに拒むこと、
   原本の設問の数（自己分析36問など）とファイルの数が合うこと

まだシード（Step 6）と運営者の API（Step 18）は作らない。

2つのファイルがテスト用の DB に取り込めて AD6 の検査を通って公開でき、make test・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 5b: 検証のテンプレートのファイル

Status: done 2026-10-14

```
BCDX の検証のテンプレートのファイル data/templates/bcdx/validation.json を作り、Step 5 の取り込み・検査・公開の処理で
入れられることを確かめてください（Step 5 から分けた）。

参照:
- docs/02-01_system-design-doc.md 5.13（テンプレートのファイル AD10 の書式）
- docs/design-spec.md 6.0.3（F/A/U を付ける設問）・6.1（確認項目の基準値）・6.2（02 の出し分けと回答の型）・6.3（費用の初期行とキー）・
  6.6（設問 ID）・9.3（転記の決まり）
- docs/drive-templates/business-idea-validation.txt（原本の写し。転記の元）

やること:
1. data/templates/bcdx/validation.json: 01・02・04・08・10 の設問（6.6 の ID。どれも F/A/U を付ける。02 CATEGORY は短文、OCEAN は
   Red / Blue / Mixed の選択、RED_1–4 は OCEAN が Red か Mixed、BLUE_1–3 は Blue か Mixed のときだけ出す）、セクションの名前と
   ガイダンス、費用の初期行（6.3 のキー）、確認項目の基準値（6.1 の既定値）を、9.3 の転記の決まりで原本から写す。AI 用プロンプトは空。
   design-spec が決めたこと（6.1 の基準値、6.2 の選択肢と出し分け、6.3 の初期行、6.6 の設問 ID）と原本が食い違う所は、
   どちらを正にするかが仕様の決定なので、写す前に止める（無人ループでは blocked と理由）
2. テスト（make test-api）: 取り込めて AD6 の検査を通って公開できること、原本の設問の数（01 が10問、02 が15問、04 が2問、08 が1問、
   10 が6問）と問いの文が原本と合うこと、費用の初期行が 6.3 のキーと名前のとおりであること

まだシード（Step 6）と運営者の API（Step 18）は作らない。

validation.json がテスト用の DB に取り込めて AD6 の検査を通って公開でき、make test・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 6: デモデータのシード

Status: done 2026-10-15

```
docs/design-spec.md 8章（デモデータ仕様）のデモデータを入れるシードを作ってください。

参照:
- docs/design-spec.md 8章（8.1 のパスワードの決まりを含む）・6.0.5（変更履歴）
- docs/02-01_system-design-doc.md 2章「make ターゲット」の db-seed・db-reset・setup、6.3（スナップショットの形と、それを作る
  domain の関数）・6.5（データのルール）
- docs/03_dev-setup.md 3章

やること:
1. packages/db のシード: テンプレートは Step 5・5b のファイルを Step 5 の取り込みと公開の処理で入れる。8.1〜8.4 のユーザー・ワークスペース・招待・
   アイデア・検証・自己分析・プラン・版・実行管理・判定・決定ログ・コメント・通知・変更履歴を、8章の「見せたい状態」が
   画面で開ける形で入れる。スナップショット（決定ログ・版）は Step 3 の domain の関数（buildKeyMetrics() など）で作る。
   パスワードは better-auth/crypto の hashPassword で作る（Step 8 で使う Better Auth と同じ版に固定する）
2. APP_ENV=local のときだけ動く。何度動かしても行の id が変わらない（SDD 6.5）
3. make setup を通しで動かし、.env の雛形・DB・マイグレーション・シード・トークン・Playwright のブラウザ・Git のフックまで
   そろうことを確かめる。まっさらな状態は、一時的な git worktree に、Docker の compose のプロジェクト名とポートを分けて作る
   （手元の .env と DB には触れない）
4. テスト（make test-api）: シードのあとで、8章の各アイデアが表の状態（確認項目・工程・判定・プランの版など）になっていること。
   後の API のステップが、自分の対象の行の形をこのテストで確かめ直す

まだ API（Step 7 以降）は作らない。

一時的な worktree のまっさらな状態（.env と DB が無い）で make setup が通り、テストで 8章の状態を確かめ、make db-seed を2回動かしても
同じ id になり、make db-reset が通り、make test・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 7: API の入口（ログ・エラー・回数制限・セキュリティ・Sentry・OpenAPI）

Status: done 2026-10-15

```
すべてのリクエストが通る API の入口の仕組みを作ってください。認証（Step 8）と認可（Step 9）の前の土台。

参照:
- docs/02-01_system-design-doc.md 2章（環境変数）・5.1（共通の決まり）・5.14（死活確認）・7.2（呼び出し元の IP・CSRF・
  セキュリティヘッダー・レート制限・個人情報）・8.1（エラー）・8.3（ログ）・11章（Sentry）、ADR-005・ADR-006・ADR-023・ADR-029

やること:
1. 入口のプラグイン（ADR-029 の②）: 呼び出し元の IP の決め方（X-Forwarded-For の右端）、リクエスト ID、
   1行1つの JSON のアクセスログ（8.3）、/api/auth/* の本体の大きさの上限
2. エラーの形（8.1）と、ログの重さの決まり（8.3）
3. 回数制限の仕組み（rate_limits テーブル。キー・上限・時間の幅は 7.2。個々の上限は、その対象を作るステップで付ける）
4. CSRF の検査とセキュリティヘッダー（7.2）
5. Sentry（API。ADR-023・11章。environment・release・タグ。7.2「個人情報」のとおり、利用者の情報・Cookie・ヘッダー・本文・
   クエリ・ブレッドクラムを送らず、URL から招待のトークンを消す）
6. Z2 /api/health/db（IP ごとの回数制限）、OpenAPI（Z3 /api/docs は staging だけ。make openapi で apps/api/openapi.json を作る）
7. テスト（make test-api）: IP の決め方（左側を偽っても右端を使う）、エラーの形、ログの項目、回数制限の数え方と 429、
   CSRF、セキュリティヘッダー、Sentry に送る前の処理が 7.2 の項目を消すこと（送り先は差し替えて確かめる）、Z2

まだ作らないもの: Better Auth（Step 8）、認可・楽観ロック・変更履歴（Step 9）、ほかのエンドポイント。

curl で /api/health・/api/health/db が 7.2 のヘッダー付きで返り、/api/docs が staging だけで開くことを、設定を直接組み立てる結合テストで確かめ、
make openapi で差分が出ず、make test-api・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 8: 認証（Better Auth と招待制）

Status: done 2026-10-15

```
Better Auth で認証を作ってください。仮の認証は作らない。

参照:
- docs/02-01_system-design-doc.md 5.4（A1〜A8・招待制）・5.13（最終利用日の間隔）・7.2（ログインの回数制限・Cookie）・8.1、ADR-010・ADR-013（メール）・ADR-029
- docs/design-spec.md 2.1（ロール）・6.16（認証の流れと文言）

やること:
1. Better Auth（Drizzle アダプター。メール＋パスワード、Google。ADR-010）を /api/auth/* に置き、入口のプラグインが決めた IP を読ませる
2. 招待制をフックで強制する（招待の無いメールの新規登録と Google ログインを拒む）
3. セッション、パスワードの再設定（A6・A7）、パスワードの変更（A8）、ログインの回数制限（ADR-029・7.2）
4. メール（MAIL_TRANSPORT。local はコンソール、staging は MAIL_ALLOWLIST のメールだけ、production は Resend）
5. users.last_active_at の更新（ログイン中の利用で、SDD 5.13 の間隔で間引いて書く）
6. テスト（make test-api）: メール＋パスワードのログインとログアウト、招待の無い登録の拒否、Google ログインのフック
   （Google への通信は差し替えて確かめる。本物は Step 43）、パスワードの再設定、回数制限、メールの送り分け
   （Resend は差し替えた HTTP の相手で確かめる）、last_active_at の間引き

まだ作らないもの: 招待のリンクからの登録と受諾の API（U4〜U6。Step 9）、認可（Step 9）。

シードのユーザーで curl からログインしてセッションの Cookie が取れ、ログアウトでき、パスワードの再設定のリンクが API のログに出て
それで再設定でき、GOOGLE_CLIENT_ID が空の local でも API が起動し（staging と production では起動しない）、
make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 9: 認可・楽観ロック・変更履歴・通知の共通の処理と、招待の受諾

Status: done 2026-10-15

```
以後の API のステップが使う共通の処理と、招待のリンクからの登録と受諾を作ってください。

参照:
- docs/02-01_system-design-doc.md 5.1・5.4（U4〜U6）・5.11（通知を作る条件）・5.13（make admin-create・ワークスペースの最終利用日）・
  6.3（workspaces.last_active_at）・7.1（権限マトリクス）・8.1、ADR-005（ルートの宣言）・ADR-019・ADR-020
- docs/design-spec.md 2.2（権限マトリクス）・6.0.2（同時編集）・6.0.5（変更履歴）・6.15（通知）・6.16（招待の受諾）

やること:
1. 認可のプラグイン（ADR-005）: 各ルートが open / signedIn / operator / scoped / located を宣言し、プラグインがまとめて確かめる。
   宣言の無いルートがあれば API は起動しない。アーカイブ済みの扱い（7.1）もここで行う
2. 楽観ロック（ADR-019）と変更履歴（ADR-020 の withHistory。batchId を含む）の共通の処理。回答などの保存は、
   トランザクションを受け取る関数にする（AI の取り込みが1つのトランザクションでまとめて保存するため。Step 16）。
   workspaces.last_active_at の更新もここで行う
3. 通知を作る共通の処理（SDD 5.11 の条件。判定・版の保存・Go / No-Go・メンション・コメントの各ステップが使う）
4. U4〜U6: 招待のリンクの確かめ・新規登録・受諾。make admin-create（SDD 2章）
5. テスト（make test-api）: 宣言の無いルートで起動しないこと、7.1 の権限マトリクスの表駆動テストの土台（この時点の行）、
   アーカイブの 409、楽観ロックの衝突、変更履歴が1件ずつ増えること、招待の受諾（期限切れ・使用済み・別のメール）、
   U5 の回数制限（7.2。ログインと同じ IP ごとの枠）、admin-create

まだ作らないもの: アカウント・ワークスペースの API（Step 10）、ほかの API、画面。

シードの招待（demo-invite-pending）で curl から新規登録して受諾でき、期限切れの招待（demo-invite-expired）が拒まれ、
make admin-create でリンクが出てそこから運営者を作れ、make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 10: API: アカウントとワークスペース

Status: done 2026-10-15

```
docs/02-01_system-design-doc.md 5.4（U1〜U3・U7〜U9）と 5.5（W0〜W5・W7・W8。W6 は欠番）の API を作ってください。

参照:
- docs/02-01_system-design-doc.md 5.1・5.4・5.5・7.1・7.2（ユーザーごとの回数制限）・8.1、ADR-024（プロフィール写真）、
  2章（AVATAR_BUCKET）
- docs/design-spec.md 6.16（アカウントとワークスペースの振る舞い・アカウントの削除）・2.2

やること:
1. U1〜U3・U7〜U9: 自分の情報、プロフィール写真（ADR-024。sharp。local は SDD 2章の AVATAR_BUCKET の local の値のとおり。
   Cloud Storage への保存は差し替えた相手で確かめ、本物は Step 43）、パスワードの変更、アカウントの削除（design-spec 6.16）
2. W0〜W5・W7・W8: ワークスペースの作成と設定、メンバーとロール、招待の発行・再送・取り消し、メンションの候補
3. 回数制限（7.2）: W4・W5・U7
4. packages/schemas に入出力のスキーマを足し、make openapi で apps/api/openapi.json を作り直す
5. シードの対象の行が、ここで作った処理の書く形と同じかを確かめる（違えばシードを直す）
6. テスト: 全エンドポイントの正常系、7.1 の権限マトリクスの表駆動テストの行、回数制限、アカウントの削除

まだ作らないもの: アイデア以降の API、画面。

シードのデータに curl で各エンドポイントを呼んで 5.4・5.5 どおりの応答が返り、
make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 11: API: アイデア・検証の中心・判定・ダッシュボード

Status: done 2026-10-15

```
コアフローの API を作ってください（PRD 4章の Must）。

参照:
- docs/02-01_system-design-doc.md 5.1・5.6（ダッシュボードとアイデア）・5.7 の V1〜V5・V18・V19・5.11（判定の通知）・7.1・8.1
- docs/design-spec.md 6.0.2（自動保存と同時編集）・6.0.3（F/A/U と根拠）・6.1（13 検証ホーム）・6.2（11 設問フォーム）・
  6.5（19 判定）・6.8（アイデアの作成・複製・アーカイブ）・6.9（5 ダッシュボード）

やること:
1. I1〜I4: アイデアの一覧・作成（検証と費用の初期行も作る）・更新・複製・アーカイブと戻し
2. V1〜V5: 検証ホームの集約（確認項目・内訳・主要指標・Next steps は packages/domain で計算する）、
   セクションの設問、回答の保存（楽観ロック・変更履歴）、根拠の付け外し
3. V18・V19: 判定の材料と判定の記録（決定ログの行と、判定の通知）
4. D1〜D4: ダッシュボード
5. スキーマと make openapi。シードの対象の行の形を確かめる
6. テスト: 全エンドポイントの正常系、権限マトリクスの行、楽観ロックの衝突、変更履歴、アーカイブの 409、複製、判定の通知

まだ作らないもの: 調査ログ・競合・前提とリスク・費用・損益の API（Step 12）、画面。

シードの Piaya Gift Box Delivery で V1 が design-spec 6.1 の内容を返し、V19 で判定を記録すると決定ログの行と通知ができ、
make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 12: API: 検証のワークシート（調査ログ・競合・前提とリスク・費用・損益）

Status: done 2026-10-15

```
docs/02-01_system-design-doc.md 5.7 の V6〜V17 を作ってください（PRD 4章の Must）。

参照:
- docs/02-01_system-design-doc.md 5.1・5.7・7.1・8.1
- docs/design-spec.md 6.0.2・6.0.3・6.3（17 費用）・6.4（18 損益・シナリオ）・6.10（14・15・16）

やること:
1. V6・V7: 調査ログ
2. V8・V9: 競合と代替
3. V10・V11: 前提とリスク
4. V12〜V14: 費用（Empty の行の追加、価格の%の行を含む）
5. V15・V16: 損益の入力と計算結果（packages/domain で計算する）
6. V17: 並べ替え
7. スキーマと make openapi。シードの対象の行の形を確かめる
8. テスト: 全エンドポイントの正常系、権限マトリクスの行、楽観ロック、変更履歴、8.3 の入力で V15 が期待値を返すこと

まだ作らないもの: 自己分析以降の API、画面。

シードのデータに curl で各エンドポイントを呼んで 5.7 どおりの応答が返り、
make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 13: API: 自己分析

Status: done 2026-10-15

```
docs/02-01_system-design-doc.md 5.8（S1〜S7）の API を作ってください。

参照:
- docs/02-01_system-design-doc.md 5.1・5.8・7.1・8.1
- docs/design-spec.md 6.2（自己分析の追加の決まり）・6.11（10 自己分析ホーム・12 メンバーの自己分析・共有）

やること:
1. S1〜S5: 自己分析（最初に開いたときに作る）・セクション・回答の保存・完了と再開・共有
2. S6・S7: メンバーの自己分析（共有したものだけを読める。共有していないメンバーは名前だけ）
3. スキーマと make openapi。シードの対象の行の形を確かめる
4. テスト: 全エンドポイントの正常系、権限マトリクスの行、共有の範囲、変更履歴

まだ作らないもの: プラン以降の API、画面。

シードの Ana・Kenji・Grace の自己分析が design-spec 8.1 の状態で返り、共有していない Kenji の回答を Owner が読めず、
make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 14: API: プランと実行管理

Status: done 2026-10-15

```
docs/02-01_system-design-doc.md 5.9 の P1〜P11 を作ってください。

参照:
- docs/02-01_system-design-doc.md 5.1・5.9・5.11（版の保存と Go / No-Go の通知）・7.1・8.1
- docs/design-spec.md 6.12（プランと検証からの引き継ぎ・版・Go / No-Go・下書きの作成）・6.13（実行管理）

やること:
1. P1〜P3: プランの作成（検証からのコピー・実行管理の初期行）・更新・アーカイブ
2. P4・P5: 項目と回答（消えた列の値を隠して残す決まりを含む）
3. P6〜P8: 版の保存（スナップショット）と Go / No-Go（決定ログの行と通知）
4. P9〜P11: 実行管理
5. スキーマと make openapi。シードの対象の行（プラン・版・実行管理）の形を確かめる
6. テスト: 全エンドポイントの正常系、権限マトリクスの行、変更履歴、版のスナップショット、通知

まだ作らないもの: Pitch Deck（Step 15）、AI（Step 16）、画面。

シードの Piaya Gift Box Delivery の Plan A・Plan B と Student Study Café が design-spec 8.2 の状態で返り、
make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 15: API: Pitch Deck と PDF

Status: done 2026-10-15

```
Pitch Deck の組み立てと PDF を作ってください。

参照:
- docs/design-spec.md 6.14（23 Pitch Deck。スライドと素材・1分版と5分版）
- docs/02-01_system-design-doc.md 5.9（P12・P13）・7.2（P13 の回数制限）・ADR-012（react-pdf・フォント・数字の字送り）・10章
- docs/06_design-tokens.json の semantic.print

やること:
1. packages/domain の buildPitchDeck()（design-spec 6.14 の各スライドの素材の決まり）
2. P12・P13（react-pdf。Step 4 の PDF のテーマ。常にライトの配色。P13 の回数制限）
3. スキーマと make openapi
4. テスト: buildPitchDeck() の各スライドの素材と省き方（make test-domain）、PDF が作れること（ページ数と文字の抽出）と
   数字の字送りが等幅であること（make test-api）、回数制限

まだ作らないもの: AI（Step 16）、画面。

シードの Piaya Gift Box Delivery の Plan A で 1分版と5分版の PDF が作れ、全スライドが埋まり、
make test-domain・make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 16: API: AI 書き出し・取り込み

Status: done 2026-10-15

```
AI 往復（コア）の書式と API を作ってください（PRD 4章の Must）。

参照:
- docs/design-spec.md 6.6（24 AI 書き出し。Markdown と JSON の書式・設問 ID）・6.7（25 AI 取り込み。振り分け・差分・反映）・
  6.0.7（移行で隠れた設問）
- docs/02-01_system-design-doc.md 5.10（X1〜X3）・7.1・7.2（X1・X3 の回数制限）・8.1・10章

やること:
1. packages/domain: 書き出しの Markdown と JSON の生成（自己分析・検証・プラン）、parseAiReply() と matchBlocks()
2. X1〜X3: 書き出し、取り込みの材料、反映（Step 9 のトランザクションを受け取る保存の処理を使い、1回の反映を
   1つのトランザクションと1つの batchId にまとめる。衝突は SDD 5.10 の形で返す）。回数制限
3. スキーマと make openapi
4. テスト: 書式の生成と解析（design-spec 6.6・6.7 の例を固定のテストに）、振り分けの規則、反映の衝突と変更履歴、
   途中で失敗したら何も保存されないこと、権限、回数制限

まだ作らないもの: 決定ログの一覧・コメント・履歴・通知・運営者の API、画面。

design-spec 6.6 の例の書き出しを取り込みに渡すと全ブロックが振り分けられて反映でき、
make test-domain・make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 17: API: 決定ログ・コメント・変更履歴・通知

Status: done 2026-10-15

```
docs/02-01_system-design-doc.md 5.11 の L1・L2・C1〜C3・H1〜H3・N1〜N3 を作ってください。

参照:
- docs/02-01_system-design-doc.md 5.11・7.1・8.1、ADR-014（期限の通知を持たない）・ADR-020
- docs/design-spec.md 6.0.4（コメントパネル）・6.0.5（変更履歴パネルと元に戻す・作成の取り消し）・6.15（7 決定ログと 8 通知）

やること:
1. L1・L2: 決定ログの一覧と詳細（その時点の不足と主要指標のスナップショット）
2. C1〜C3: コメント・返信・メンション・解決（Step 9 の通知の処理で、メンションと自分の項目へのコメントの通知を作る）
3. H1〜H3: 変更履歴・1件を戻す・操作全体を戻す・作成の取り消し（SDD 5.11 の決まりどおり）
4. N1〜N3: 通知・未読数・既読
5. スキーマと make openapi。シードの対象の行（コメント・通知・変更履歴）の形を確かめる
6. テスト: 全エンドポイントの正常系、権限マトリクスの行、戻すことも履歴に残ること、ALREADY_REVERTED・UNDO_BLOCKED・BUSY、
   通知が作られるすべての条件（判定・版の保存・Go / No-Go・メンション・コメント）

まだ作らないもの: テンプレートの移行と運営者の API（Step 18）、画面。

シードのデータで H2・H3 の戻しと作成の取り消しが SDD 5.11 どおりに動き、
make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 18: API: テンプレートの移行と運営者

Status: done 2026-10-16

```
docs/02-01_system-design-doc.md 5.12（T1・T2）と 5.13（AD1〜AD10）の API を作ってください。これで API はすべてそろう。

参照:
- docs/02-01_system-design-doc.md 5.12・5.13・7.1・7.2（AD9 の回数制限）・8.1
- docs/design-spec.md 6.0.7（テンプレートの版と移行 M8）・6.17（26〜28 運営者の画面）

やること:
1. T1・T2: 移行のプレビューと移行（引き継げない回答・隠して残す値・費用の初期行の扱いは design-spec 6.0.7 と SDD 5.12）
2. AD1〜AD6: テンプレートと版の一覧・下書き・編集・並び・公開の前の検査と公開（Step 5 の処理を使う）
3. AD7〜AD9: ユーザー・ワークスペース・招待の一覧（件数と最終利用日）、停止と再開、招待の発行（回数制限）
4. AD10: ファイルからの取り込み（Step 5 の処理を使う）
5. スキーマと make openapi
6. テスト: 全エンドポイントの正常系、権限マトリクスの全行（ここで 7.1 の表がすべて埋まること）、移行と戻し、
   停止したユーザーのセッションの扱い、回数制限

まだ画面は作らない。

7.1 の権限マトリクスの全行が表駆動テストに入って通り、SDD 5.3 の全エンドポイントに結合テストがあり、
make test-api・make openapi（差分なし）・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 18b: API: 段階の見直しで決めたことの反映

Status: done 2026-10-16

```
API の段階（Step 7〜18）の docs の差分を見直して、ユーザーが 2026-10-16 に決めたことを docs と実装に入れてください。
見直しでは、独立のサブエージェントが docs の差分から、仕様を弱めた所と、docs の記述同士の食い違いをどちらかに決めた所を挙げ、
ユーザーが1件ずつ決めた。ここに挙げていない所は変えない（ユーザーが今の docs のまま認めた所を含む）。

参照:
- docs/design-spec.md 6.0.7（費用行の移行）・6.8（複製）・6.14（Pitch Deck の収め方）
- docs/02-01_system-design-doc.md 5.1（同時編集・404）・5.5（W8）・5.6（I3）・5.12（T2）・5.13（AD6）・6.3（回答のテーブル）

やること（ユーザーの決定。2026-10-16）:
1. T2 の費用行: 足すのは、固定している版に無く新しい版にある初期行のキーだけにする（6.0.7「新しい版で増えた初期行」）。
   両方の版にあるキーは、アイデアにそのキーの行が無くても足さない（削除した行を写さない複製で、元で削除した行が移行で戻らないように。
   6.0.7「ユーザーが削除した行は、同じキーが新しい版にあっても戻さない」）。6.0.7 の括弧書き「キーが既存の行にないもの」と
   SDD 5.12 T2 の「そのキーの行が無ければ足す」をこの意味に直す。移行を H3 で戻してからの移行で足し直すこと、利用者が消した行は
   足さないことは今のまま。テスト: 費用行を削除したアイデアを複製し、その複製を移行しても行が戻らない
2. I3（複製）: 写した調査ログの記録者は、元の調査ログの記録者のままにする（今は複製した人）。提案者は今のまま複製した人。
   design-spec 6.8・SDD 5.6・シードの複製（Piaya Gift Box (Corporate)）を合わせる。テスト: 複製の調査ログの記録者が元と同じ
3. W8: 対象（targetType・targetId）がワークスペースに無ければ 404 NOT_FOUND にする（SDD 5.1。今は確かめない）。SDD 5.5 の
   「対象の行が有るかは確かめない」を直す。テスト: 無い対象・別のワークスペースの対象で 404
4. 同時編集の例外を SDD 5.1「同時編集」に書く: 送った内容が保存されている内容と同じ更新は、lockVersion が古くても 409 にせず、
   何も書かずに通す（今の V3・V14・S3・X3 の動き。両方が同じ内容の衝突の確認を出さないため）。5.1 の「同時編集」が対象にする
   ほかの更新の API もすべてこれに揃え、揃っていることをテストで確かめる
5. AD6: テンプレートの種類ごとに、その種類の回答が保存できない回答の型を、公開できないエラーにする（金額＋理由は自己分析だけ。
   ほかの型も SDD 6.3 の回答のテーブルから決める）。種類ごとの型を SDD 5.13 に書く。テスト: 検証とプランのテンプレートの
   金額＋理由の設問が AD6 で断られ、BCDX の3つのテンプレートは通る

確かめること（6 は確かめた結果、収まらないスライドがあったので Step 18c に分けた）:
6. design-spec 6.14 の「すべてを1行にしても高さが足りないときは、本文の下端で切れて出し」が、上限の件数で起きるか。結果と決めることは Step 18c

まだ画面は作らない。

1〜5 が docs と実装とテストに入り、make test・make openapi（差分なし）・make typecheck・make lint・make doc-lint が
通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 18c: API: Pitch Deck が上限の素材で収まらないときの決定

Status: done 2026-10-16

```
Step 18b の 6（design-spec 6.14「すべてを1行にしても高さが足りないときは、本文の下端で切れて出し」）を確かめたら、
収まらないスライドがあった。ユーザーが決めた直し方を docs と実装とテストに入れてください。

参照:
- docs/design-spec.md 6.14（23 Pitch Deck）・6.13（ローンチの区分）
- docs/02-01_system-design-doc.md 5.9（PitchDeck）
- docs/06_design-tokens.json の semantic.print.slide と semantic.print の文字の大きさ

確かめた結果（2026-10-16。API の PDF のフォント（apps/api/src/pitch-fonts.ts の loadPitchFonts）で測った）:
- 測り方: BCDX のプランのテンプレートのすべての文を、最小の大きさで1行に収まる短い文にし、上限の件数の素材（競合5・
  マイルストーン6・ローンチの区分6・リスク3・Next Actions 3、§11 の表、シナリオの表）で packages/domain の fitPitchSlide にかけた
- 収まる: 1分版の8枚と、5分版の Execution plan 以外の11枚（英語の文でも日本語の文でも）
- 収まらない: 5分版の Execution plan（表のスライド）。最小の大きさ（見出し 26pt・セル 12pt）で、見出し 32.5 ＋ 間 24 ＋
  表 204.4（見出しの行 29.2 ＋ 6行 × 29.2）＋ 間 24 ＋ 注記 127.2（6つ × 16.2 ＋ 間 5 × 6）＝ 412.1pt。
  本文の高さは 412pt（540 − 上下の余白 80 − フッター 24 − 間 24）。マイルストーンを5件にするか、ローンチの区分を5つにすると収まる
- 日本語の文: 収まりの計算は CJK を含む文を1行多く数える（pitch-fit.ts の CJK_EXTRA_LINES。react-pdf の行分けとの差の余裕）。
  マイルストーンとローンチの文が日本語だと、マイルストーン6件ならローンチの区分1つから、5件なら3つから収まらない
- いまの動き: 6.14 のとおり本文の下端で切れて出し、「Too long for this slide…」を出す。6.14 の括弧書き
  「素材の数が決まっているので、ふつうは起きない」は、上の結果と合わない

ユーザーの決定（2026-10-16）: 5分版の Execution plan を2枚に分ける。何も削らず、文字も小さくしない（2026-10-11 の
「箇条書きを減らさない」決定を守る）。5分版は12枚から13枚になる。
- Execution plan（execution・表）: §23 マイルストーン（期限順に最大6件）の表だけ。ローンチの要約の注記は持たない
- 新しいスライド Launch plan（launch・文章）を Execution plan の直後に置く: §25 ローンチを時期の区分ごとにまとめた要約を、
  区分ごとに1つの箇条書きにする（区分の名前は 6.13 の固定の名前で、ほかの箇条書きと同じく太字で前に置き、その区分の行の
  Actions を並べる。Actions の無い区分は出さず、どの区分にも無ければ「Launch Plan: Not written yet」）。「Edit source」の移動先は §25
- Risks と Ask / next step は1つずつ後ろにずれる。1分版は変えない

やること: 決定を design-spec 6.14（5分版の表・各ページの決まり・Edit source の移動先）と SDD 5.9（PitchDeck・スライドのキー）に書き、
packages/domain の組み立てと収め方、P12・P13、スライドのキー（コメントの対象 `pitch_slide`）、シードを直す。テスト: 上限の件数の
素材で、英語の文と日本語の文の両方で、5分版と1分版のどのスライドも下端で切れない（収めきれない文を「…」で切ることはあってよい）。
それでも収まらないスライドがあれば、スライド・足りない高さ・入らない素材を書いて止める（blocked と理由）。design-spec 6.14 の
「すべてを1行にしても高さが足りないときは、本文の下端で切れて出し」の文は、上限の件数でもすべて収まる（テストで確かめている）
という事実に書き換える。

まだ画面は作らない。

決めた直し方が docs と実装とテストに入り、make test・make openapi（差分なし）・make typecheck・make lint・make doc-lint が
通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 18d: API: 公開するテンプレートの Pitch Deck の検査

Status: done 2026-10-16

```
Step 18c で5分版を13枚にし、BCDX のプランのテンプレートでは、上限の件数の素材でどのスライドも収まることをテストで確かめた。
ただし design-spec 6.14 には、すべてを切っても高さが足りない場合が3つ残っている（テンプレートの §8・§20 に文章の小項目を
足したとき、小項目のタイトルが長くて「…」と合わせて1行に収まらないとき、数字が折り返したとき）。ユーザーが決めた扱いを
docs と実装とテストに入れてください。

参照:
- docs/design-spec.md 6.14（23 Pitch Deck。収め方と「Edit source」の移動先）・6.17 の 27（公開の前の検査）
- docs/02-01_system-design-doc.md 5.13（AD6）・9章（テストの表の「API の結合」の行）
- apps/api/src/pitch-fit.test.ts（上限の件数の素材の組み方）

確かめた結果（2026-10-16。pitch-fit.test.ts の「every text short」のテストで、数字だけを変えて測った）:
- 1個あたりの金額（販売価格・変動費・貢献利益）: ₱999,999 では収まり、₱9,999,999 では5分版の Business model と Economics が収まらない
- 初期費用は ₱999,999,999、シナリオの売上は ₱99,999,999、競合の価格は ₱999,999,999,999 まで収まる

ユーザーの決定（2026-10-16）:
1. テンプレートから来る場合（§8・§20 に文章の小項目を足した版、小項目のタイトルが長い版）は、AD6 の検査で公開を断る。
   プランのテンプレートの版を上限の件数の素材で Pitch Deck に組み、1分版か5分版に本文の下端で切れるスライドがあれば、
   公開をふさぐエラーにする（コード `pitch_deck_overflow`。1分版と5分版のそれぞれで、スライドごとに1つ。`nodeId` はそのスライドの
   「Edit source」の移動先のセクションのノード）。素材は Step 18c のテストと同じ考え方で組む: すべての文を、最小の大きさで
   1行に収まる短い文にし（英語の文と日本語の文の両方で確かめる）、リストは上限の件数、数字は下の 2 の範囲に収まる値にする。
   publish は、このエラーがあればほかのエラーと同じく `422 TEMPLATE_INVALID`
2. 金額が大きくて数字が折り返す場合は、今の 6.14 のとおり本文の下端で切れて出し、同じ注意を出す。6.14 に上の測った範囲を書く

やること: 決定を design-spec 6.14（すべてを切っても高さが足りないのは金額が大きくて数字が折り返したときだけで、測った範囲。
テンプレートから来る場合は AD6 が公開を断ること）と SDD 5.13 AD6（`pitch_deck_overflow`）・9章に書き、AD6 の検査を作る。
収め方は API の PDF のフォント（apps/api/src/pitch-fonts.ts の loadPitchFonts）で測るので、検査をどこに置くかは実装で決めて
報告する。プランのテンプレートの版を公開するすべての経路（AD6 publish、シードとテンプレートの取り込みが使う公開）が
同じ検査を通すようにし、通さない経路を残すならその理由を報告する。
テスト: BCDX のプランのテンプレートの版（data/templates/bcdx とシード）はこのエラーを出さない。§20 に文章の小項目を足した版と、
小項目のタイトルを長くした版は、このエラーで公開できない（英語の文で溢れる場合も、日本語の文で溢れる場合も）。
pitch-fit.test.ts の「more §20 text sub-items」のテストは、AD6 が断る版の話になったので、下端で切る動きは残る場合
（1個あたりの金額が大きい）で確かめる形に直す。

まだ画面は作らない。

決めた扱いが docs と実装とテストに入り、make test・make openapi（差分なし）・make typecheck・make lint・make doc-lint が
通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 18e: API: 5分版の Economics を2枚に分ける

Status: done 2026-10-16

```
Step 18d の独立レビューで、18d で決めた2つの場合（テンプレートから来る場合・金額が大きくて数字が折り返す場合）のほかに、
すべての文を切っても本文の高さに収まらない場合が見つかった。どれも5分版の Economics で、数字の列（Startup cost・
Break-even / day・Payback・ROI）が折り返して高くなり、シナリオの表と注記（§20 の文章の小項目。日本語の文は1行多く数える）と
合わせて本文の高さを超える。ユーザーが決めた扱いを docs と実装とテストに入れてください。

参照:
- docs/design-spec.md 6.14（23 Pitch Deck の数字のスライドと収め方）・6.4（計算できない主要指標の表示）
- docs/02-01_system-design-doc.md 5.9（PitchDeck）・5.13（AD6 の pitch_deck_overflow）・10章（テストの表）
- apps/api/src/pitch-fit.test.ts（「the amounts of design-spec 6.14's range」のテスト）

確かめた結果（2026-10-16。API の PDF のフォントで、BCDX のプランのテンプレートと AD6 と同じ上限の件数の素材で測った）:
- 計算できない主要指標: Break-even / day・Payback・ROI のどれかが「Contribution margin is zero or negative. Review price or
  variable costs.」（貢献利益が0以下。3つとも）か「Not recovered: Expected profit is zero or negative」（期待シナリオの営業利益が
  0以下。Payback）になると、日本語の文のときに下端で切れる。英語の文では収まり、1分版も収まる。6.14 はこの表示をラベルの
  大きさで出し、単語の間で折り返すと決めている
- 計算した指標が大きいとき: 金額が 6.14 の範囲でも、Payback が「9,999.9+ months」か ROI が「≈ −9,999.9%」だと英語の文でも
  下端で切れる。Break-even / day が「99,999.9+」だと日本語の文で切れる。組み合わせでは、Break-even / day「999.9+」・
  Payback「99.9+ months」・ROI「≈ −999.9%」・Startup cost「₱99,999,999+」で、英語の文では折り返して注意が出て、
  日本語の文では下端で切れる
- 期待シナリオの営業利益が0以下のプランや、利益が小さく Payback が長いプランは珍しくないので、金額が極端に大きい場合と
  違って、ふつうに起きる
- いまの動き: 6.14 の「すべてを切っても高さが足りないとき」の決まりのとおり、本文の下端で切れて出し、
  「Too long for this slide…」を出す（18d で 6.14 にこれらの場合を書き、上のテストで確かめている）

ユーザーの決定（2026-10-16）:
1. 5分版の Economics を2枚に分ける。何も削らず、文字も小さくしない（18c と同じ）。5分版は13枚から14枚になる。1分版は変えない
   - Economics（economics・表）: Startup cost・Break-even / day・Payback・ROI の数字と、シナリオの表だけ。注記は持たない
   - 新しいスライド Funding plan（funding・文章）を Economics の直後に置く: §20 の文章の小項目（Opening cash reserve・
     Runway if sales are below plan・Trigger for additional funding）を、ほかの文章のスライドと同じく素材の名前を太字で前に置いた
     箇条書きにする。空の素材は、ほかのスライドと同じく「Opening cash reserve: Not written yet」のように名前を残す。
     「Edit source」の移動先は §20。数字を持たないので「Edit in validation」は置かない
   - 後ろのスライド（Why us 以降）は1つずつ後ろにずれる
2. 数字が折り返しただけでは「Too long for this slide…」の注意を出さない。注意を出すのは、文を「…」で切ったときと、
   本文の下端で切れたときだけ（数字は短くできないので、直せない注意を出さない）

やること:
- 決定を design-spec 6.14（5分版の表・各ページの決まり・Edit source の移動先・注意を出す条件）と SDD 5.9（PitchDeck・
  スライドのキー）に書き、packages/domain の組み立てと収め方、P12・P13、スライドのキー（コメントの対象 `pitch_slide`）、
  i18n のキー、シードを直す
- Step 18d で design-spec 6.14 と SDD 10章に書いた、計算できない主要指標の表示と大きな計算した指標で「本文の下端で切れる」
  という決まり（「数字と計算できない主要指標の表示が折り返さないかぎり」の除外を含む）は、ユーザーが決めていない。
  分けたあとに測った事実で書き直す
- 6.14 の「公開したプランのテンプレートでは」は、公開のときに AD6 が確かめることが分かる書き方にする（公開のあとでフォントや
  トークンを変えても、公開済みの版は確かめ直さない）
- テスト（上限の件数の素材で、英語の文と日本語の文の両方で）: 5分版の Economics と Funding plan は、計算できない主要指標の
  理由の文（「Contribution margin is zero or negative…」・「Not recovered: …」）でも、計算した指標のいちばん長い表示
  （Payback「9,999.9+ months」・ROI「≈ −9,999.9%」・Break-even / day「99,999.9+」と、それらの組み合わせ）でも、下端で
  切れない。数字が折り返しただけのスライドは注意を出さない
- AD6 の `pitch_deck_overflow` の素材の数字を、計算した指標のいちばん長い表示と計算できない主要指標の理由の文にしても
  BCDX のプランのテンプレートが通るなら、その素材で検査する（公開する版が、ふつうに起きるプランの状態でも収まることを
  確かめるため）。通らなければ、どの素材でどのスライドが何 pt 足りないかを書いて止める（blocked と理由）
- 金額が 6.14 の範囲を超えて下端で切れる場合（18d で決めたもの）は、そのまま残してよい。分けたあとの範囲を測り直して 6.14 に書く
- 分けても上の場合で下端で切れるスライドが残れば、スライド・足りない高さ・入らない素材を書いて止める（blocked と理由）

まだ画面は作らない。

決めた扱いが docs と実装とテストに入り、make test・make openapi（差分なし）・make typecheck・make lint・make doc-lint が
通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 19: Web の部品（1）: 土台・文字・ボタン・入力欄

Status:

```
docs/design-spec.md 4.5 の部品のうち、土台・文字・ボタン・入力欄を packages/ui-web に作ってください。
見た目は Step 4 の生成したテーマ（semantic 層）だけを参照し、値を直書きしない。

参照:
- docs/design-spec.md 1.3（UI設計原則）・4.3（レスポンシブ）・4.4（ビジュアルの方針）・4.5（部品の一覧。このステップの対象の行）
- docs/06_design-tokens.json
- docs/02-01_system-design-doc.md ADR-018・ADR-025・10章（Web の部品の行）
- docs/03_dev-setup.md 1章（デザインのスキルの使い分け）・3.3（/dev/components）

やること:
1. 土台: Flex / Stack / Grid / Container、Heading / Text、Divider、Well、Form、Link
2. ボタン: Button / ButtonGroup、ActionButton / ActionGroup、ToggleButtonGroup、SegmentedControl
3. 入力欄: TextField / TextArea、NumberField、SearchField、Picker、ComboBox、RadioGroup、Checkbox / CheckboxGroup、Switch、
   DatePicker、FileTrigger、TagGroup
4. /dev/components（開発サーバーだけ。テーマとスケールの切り替え。本番のビルドには入らない）に並べる
5. E2E の土台（e2e/playwright.config.ts。この時点は Web の開発サーバーだけを起動する。API・DB・シードは Step 23 で足す）と、
   /dev/components を3つの幅・ライトとダーク・2つのスケールで開いて部品が描かれることを確かめる E2E
6. テスト（make test-web。Vitest ＋ Testing Library ＋ @react-aria/test-utils）: 各部品の種類・大きさ・状態、キーボード操作

まだ作らないもの: 重ねて出す部品・知らせる部品（Step 20）、データの表示と独自の部品（Step 21）、パターン（Step 22）。

make test-e2e で /dev/components のこのステップの部品がライトとダーク・2つのスケール・3つの幅で描かれ、
make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 20: Web の部品（2）: 重ねて出す部品と知らせる部品

Status:

```
docs/design-spec.md 4.5 の部品のうち、重ねて出す部品と知らせる部品を packages/ui-web に作ってください。

参照:
- docs/design-spec.md 3.8（モーダル・シート・パネルの大きさとスマホでの出し方）・4.3・4.4・4.5（このステップの対象の行）
- docs/06_design-tokens.json（semantic.layout.dialog-max-width など）
- docs/02-01_system-design-doc.md ADR-018・ADR-025・10章

やること:
1. 重ねて出す部品: Dialog / AlertDialog、Popover / Tray（幅で切り替える）、ActionMenu / Menu、Tooltip / ContextualHelp
2. 知らせる部品: InlineAlert、Toast、ProgressBar / ProgressCircle、Skeleton、IllustratedMessage、StatusLight、Badge
3. 開閉する部品: Disclosure / Accordion、Tabs、Breadcrumbs
4. /dev/components に並べ、Step 19 の E2E に足す（Popover と Tray が幅で切り替わること）
5. テスト（make test-web）: 各部品の種類・大きさ・状態、Popover と Tray の切り替え、フォーカスの戻り先、キーボード操作

まだ作らないもの: データの表示と独自の部品（Step 21）、パターン（Step 22）。

make test-e2e で /dev/components のこのステップの部品が描かれ、Popover と Tray がウィンドウの幅で切り替わり、
make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 21: Web の部品（3）: データの表示と独自の部品

Status:

```
docs/design-spec.md 4.5 の部品のうち、データの表示と独自の部品を packages/ui-web に作ってください。

参照:
- docs/design-spec.md 4.4（月相の形・F/A/U の印）・4.5（このステップの対象の行）・6.0.3（F/A/U の付け方）
- docs/06_design-tokens.json
- docs/02-01_system-design-doc.md ADR-018・ADR-025・10章

やること:
1. データの表示: TableView、ListView、Card / CardView、Tree、Meter（積み上げ）、CheckDots、Avatar
2. 独自の部品: MoonGlyph、FauPicker、MetricTile、RowList / RowListItem、QuestionCard、DiffText、MentionTextArea、Panel、Slide、Steps
3. /dev/components に並べ、Step 19 の E2E に足す
4. テスト（make test-web）: 各部品の種類・大きさ・状態、FauPicker の操作、表のキーボード操作

まだ作らないもの: アプリの枠の部品とパターン（Step 22）。

make test-e2e で /dev/components のこのステップの部品が描かれ、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 22: Web の部品（4）: アプリの枠とパターン A〜J

Status:

```
アプリの枠の部品とレイアウトのパターンを作り、部品全体を見直してください。

参照:
- docs/design-spec.md 4.1（パターン A〜J のデスクトップ・タブレット・スマホの並び）・4.2・4.3・4.5（SideNav / TabBar・AppFrame・
  PageFrame・RouterProvider と、パターンの枠の行）・6.0.1（アプリの枠）
- docs/06_design-tokens.json
- docs/02-01_system-design-doc.md ADR-018・ADR-025・10章
- docs/03_dev-setup.md 1章（デザインのスキルの使い分け）

やること:
1. SideNav / TabBar、AppFrame、PageFrame、RouterProvider
2. パターンの枠: HubPattern・FocusPattern・QuestionFormPattern・ListDetailPattern・CardComparePattern・WorksheetPattern・
   StepsPattern・SettingsPattern・PresentationPattern・PublicPattern（4.1 の3つの幅の並び）
3. /dev/components にパターンを並べて Step 19 の E2E に足し、4.5 の全部品がそろったことを確かめる
4. 部品を作り終えたら、frontend-design の手順で、Playwright のスクリーンショットを 4.4 と 06 に照らして見直し、見つかった所を直す
   （使ったスキルは完了報告に書く）
5. テスト（make test-web）: パターンの幅ごとの並び、枠の部品の操作

まだ画面は作らない。

make test-e2e で /dev/components の 4.5 の全部品とパターン A〜J がライトとダーク・2つのスケール・3つの幅で描かれ（パターンは 4.1 の並び）、
make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 23: Web の土台・アプリの枠・5 ダッシュボードと E2E の土台

Status:

```
画面の土台と、ログインの行き先の 5 ダッシュボードを作ってください（PRD 4章の Must。5 は Should だが、ログインの行き先なのでここで作る）。

参照:
- docs/design-spec.md 5章（画面遷移・ログイン後の行き先・共通のナビ）・6.0.1（アプリの枠）・6.0.6（共通の状態表示）・
  6.9（5 ダッシュボード）・3.8（M7）・6.16（M7 の新しいワークスペース）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 2章（環境変数の e2e の値）・4章（ルーティング）・5.6（D1〜D4）・8.2（画面でのエラーの出し方）・
  9章・11章（Web の Sentry）・7.2（個人情報）・ADR-004（HTML の meta 要素）・ADR-011（TanStack Query）・ADR-023
- docs/03_dev-setup.md 7章（E2E の起動と X-Forwarded-For）

やること:
1. Web の土台: ルーティング（SDD 4章。ルートは画面を作るステップで足す）、Eden Treaty のクライアント、TanStack Query と Form の設定、
   HTML の meta 要素から環境名と Sentry を決める処理、Web の Sentry（7.2 のとおり送る中身を削る）、エラーの境界（8.2）
2. アプリの枠: AppFrame とナビ（まだ無い画面への入口は置かない）、M7 ワークスペースの切り替えと新しいワークスペース、
   共通の状態表示（6.0.6。読み込み・空・権限なし・見つからない・エラー・オフライン）
3. 5 ダッシュボード（D1〜D4。Getting started の M1 の入口は Step 25 でつなぐ）
4. E2E の土台を広げる（e2e/）: playwright.config.ts に API 3100・Web 5273 の webServer を足し、global-setup.ts（テスト用の DB を作り直してシードを入れる）、
   fixtures.ts（テストごとに違う X-Forwarded-For、API でログインしたセッション）
5. テスト: Vitest（エラーの境界・状態表示・Sentry に送る前の処理）、E2E（API でログインして 5 が開き、M7 で切り替えと新しいワークスペースができる）

まだ作らないもの: 1・2・3 とログアウト（Step 24）、29・30（Step 42）、ほかの画面。

make test-e2e で 5 と M7 の E2E が通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 24: 入口の画面: 1・2・3 とログアウト

Status:

```
ログインする前の画面と、ログイン・登録・ログアウトの流れを作ってください（PRD 4章の Must。1 は Could だが、ログアウトの行き先なのでここで作る）。

参照:
- docs/design-spec.md 3.1・6.16（1 ランディング・2 ログイン / 新規登録 / パスワードの再設定・3 オンボーディング）・5章
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章（/robots.txt を含む）・5.4・ADR-004（/ をビルドのときに HTML にする）
- docs/03_dev-setup.md 1章（1 に使うデザインのスキル）

やること:
1. 1 ランディング（ビルドのときに HTML を作る）と /robots.txt
2. 2 ログイン / 新規登録（招待のリンクから）/ パスワードの再設定、3 オンボーディング（招待の受諾・プロフィール）
3. ログアウト（ナビに足す）と、ログイン後・ログアウト後の行き先（5章）。未保存の入力があるときのログアウトの確認は、入力の仕組みを作る Step 25 で足す
4. テスト: Vitest（入力の規則・エラーの文言）、E2E（招待のリンク demo-invite-pending から登録 → 3 → 5、ログイン → 最後に開いた
   ワークスペースの 5、パスワードの再設定、ログアウト → 1、期限切れの招待）

まだ作らないもの: 29・30 と、そこへのリンク（Step 42）、ワークスペースの中のほかの画面（Step 25 以降）。

make test-e2e で上の流れが通り、make build-web で 1 の HTML ができ、make build・make test-web・make typecheck・make lint が通る状態をゴールとする。
（make build と make build-web は、SPA の殻 _shell.html のプリレンダーが / を開くので、/ のルートができるこのステップまで失敗する。Step 1 で、/ に仮のルートを置けば通ることを確かめた）

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 25: 共通の入力の仕組み・6 アイデア一覧・M1・13 検証ホーム

Status:

```
入力の共通の仕組みと、コアフローの入口の画面を作ってください（PRD 4章の Must）。

参照:
- docs/design-spec.md 6.0.2（自動保存と同時編集）・3.8（M9）・6.8（6 アイデア一覧と M1）・6.1（13 検証ホーム）・4.1・4.2（パターン A・D）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.6・5.7（V1）・ADR-019・ADR-021（再送）・10章（Web の行）

やること:
1. 共通の入力の仕組み: 自動保存と楽観ロックの衝突の確認（6.0.2）、保存できなかった入力の再送とオフラインのときの入力の停止・
   離脱の確認（ADR-021）、未保存の入力があるときのログアウトの確認（5章）、M9 ログインし直し（2 へ移る流れを含む）、
   保存のときの X-Moonx-Client（web / web_mobile）
2. 6 アイデア一覧と M1 新しいアイデア（絞り込み・並べ替え・複製・アーカイブ）。5 の Getting started からの M1 の入口
3. 13 検証ホーム（主要な数字・確認項目6つ・F/A/U の内訳・Next steps・セクションの一覧・判定の履歴・プランの一覧）。
   まだ無い画面（11・14〜19・20 など）への入口は、その画面のステップがつなぐ
4. デスクトップ・タブレット・スマホの並び（4.1）
5. テスト: Vitest（自動保存と再送、衝突の確認、M9、X-Moonx-Client、権限による出し分け）、E2E（アイデアを作って 13 を開く、
   複製とアーカイブ、Viewer が作れないこと、3つの幅の並び）

まだ作らないもの: 11・14〜19・24・25（Step 26〜29）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 26: 11 設問フォーム（検証）・M2 根拠シート・14 調査ログ

Status:

```
検証の設問に答えて根拠を残す画面を作ってください（PRD 4章の Must）。

参照:
- docs/design-spec.md 6.2（11 設問フォーム。検証の 01 / 02 / 10）・6.0.3（F/A/U の付け方と M2）・6.10（14 調査ログ）・4.1（パターン C・D と C の補足）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.7（V2〜V7）

やること:
1. 11 設問フォーム（検証）: フォーカスの動き・EXAMPLE・ヒント・F/A/U の操作・Focus のスイッチ・キーボードでの移動
2. M2 根拠シート（調査ログから選ぶ・新しく足す・URL）
3. 14 調査ログ（絞り込み・新しい調査ログの入力と確認項目のタグ）
4. 13 から 11・14 への入口をつなぐ
5. テスト: Vitest（設問フォームのフォーカス、F/A/U のボタンと M2）、E2E（13 → 11 で回答して F/A/U と根拠を付け、13 の確認項目と
   Next steps が変わる。14 で調査ログを足して M2 から選ぶ。Viewer は読み取りだけ）

まだ作らないもの: 15・16（Step 27）、17〜19（Step 28）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 27: 15 競合と代替・16 前提とリスク

Status:

```
検証の残りのワークシートの画面を作ってください（PRD 4章の Must）。

参照:
- docs/design-spec.md 6.10（15 競合と代替・16 前提とリスク）・6.0.3（F/A/U を持たない行の根拠）・4.1（パターン D・E）・3.8（15 の追加・編集の大きさ）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.7（V8〜V11・V17）

やること:
1. 15 競合と代替（カードと表の切り替え・生き残り / 失敗のパターン・追加と編集のダイアログ・並べ替え）
2. 16 前提とリスク（2つのリストの切り替え・並べ替え）
3. 13 から 15・16 への入口をつなぐ
4. テスト: Vitest（主要な操作と権限による出し分け）、E2E（競合を足して表で比べる、前提とリスクを足して並べ替える、M2 で根拠を付ける）

まだ作らないもの: 17〜19（Step 28）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 28: 17 費用・18 損益とシナリオ・19 判定

Status:

```
コアフローの後半の画面を作ってください（PRD 4章の Must）。

参照:
- docs/design-spec.md 6.3（17 費用）・6.4（18 損益・シナリオ）・6.5（19 判定）・4.1（パターン B・F）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 5.7（V12〜V19）

やること:
1. 17 費用: 初期・月額固定・変動費の表、Empty の行、価格の%の行、F/A/U と根拠、合計（結果の出し方は 4.1 F）
2. 18 損益・シナリオ: 入力・4シナリオ・損益分岐・投資回収・ROI・警告（計算は packages/domain。表示と書式は 6.4）
3. 19 判定: 不足項目と主要指標・Proceed / Hold / Drop と理由・決定ログへの記録。Proceed の後の M5 の入口は Step 34 でつなぐ
4. 13 から 17・18・19 への入口をつなぐ
5. テスト: Vitest（費用のワークシートの合計、損益の表示）、E2E（Piaya Gift Box Delivery の 17・18 が 8.3 の期待値を表示し、
   入力を変えると結果がその場で変わる。19 で判定を記録すると 13 の判定の履歴（L1）に載る）

まだ作らないもの: 24・25（Step 29）、M5（Step 34）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 29: 24 AI 書き出し・25 AI 取り込み

Status:

```
AI 往復の画面を作ってください（PRD 4章の Must）。

参照:
- docs/design-spec.md 6.6（24 AI 書き出し）・6.7（25 AI 取り込み）・4.1（パターン G）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.10

やること:
1. 24 AI 書き出し: 範囲の選択 → 確認 → 書き出し（コピーとダウンロード）
2. 25 AI 取り込み: 貼り付け → 設問 ID で振り分け（packages/domain の parseAiReply() と matchBlocks()）→ 差分確認 → 反映
3. 入口: 13 と 11（検証）の「Export for AI」「Import from AI」をつなぐ。10・11（自己分析）・20・21 からの入口は、それらの画面のステップでつなぐ
4. テスト: Vitest（振り分けの表示・差分の確認・反映のあとの F/A/U）、E2E（検証を書き出し、AI の返答の形に直して貼ると振り分けられて反映できる）

まだ作らないもの: 自己分析とプランの画面（Step 33・34）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 30: 4 アカウント設定・9 ワークスペース設定

Status:

```
アカウントとワークスペースの設定の画面を作ってください（PRD 4章の Must: アカウントの削除と招待。同じ画面の Should と Could の操作も作る）。

参照:
- docs/design-spec.md 6.16（4 アカウント設定・9 ワークスペース設定・アカウントの削除）・4.1（パターン H）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.4（U1〜U3・U7〜U9）・5.5（W1〜W5・W7）

やること:
1. 4 アカウント設定: プロフィールと写真・パスワード・表示モード・所属・アカウントの削除（削除の後は 1 へ）
2. 9 ワークスペース設定: 名前と通貨・招待の発行と再送と取り消し・ロールの変更・メンバーの削除
3. ナビからの入口をつなぐ
4. テスト: Vitest（主要な操作と権限による出し分け）、E2E（招待を出して、そのリンクから別のユーザーが登録して入る。アカウントを削除すると 1 へ移り、
   ログインできない）

まだ作らないもの: 26〜28（Step 31）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 31: 26〜28 運営者の画面

Status:

```
運営者の画面を作ってください（PRD 4章の Must: テンプレートの取り込みと公開、招待の発行。同じ画面の Should と Could の操作も作る）。

参照:
- docs/design-spec.md 6.17（26〜28）・6.0.8（27 の入力の規則）・4.1（パターン D とツリー）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.13（AD1〜AD10）

やること:
1. 26 テンプレート一覧（版の一覧・ファイルからの取り込み）
2. 27 テンプレート編集（ツリー・下書きの編集・公開の前の検査と公開）
3. 28 ユーザーとワークスペース（一覧・件数と最終利用日・停止と再開・招待の発行）
4. 運営者のナビからの入口をつなぐ
5. テスト: Vitest（主要な操作）、E2E（運営者でファイルを取り込んで検査して公開し、招待を出す。一般のユーザーは開けない）

まだ作らないもの: Should の画面（Step 32〜34）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 32: Should（1）: 7 決定ログ・8 通知・PNL-1 コメント・PNL-2 変更履歴

Status:

```
チームで使うための画面とパネルを作ってください（PRD 4章の Should）。

参照:
- docs/design-spec.md 6.15（7 決定ログ・8 通知）・6.0.4（PNL-1）・6.0.5（PNL-2 と元に戻す・作成の取り消し）・4.1（パターン D と通知の補足）・3.8
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 2章「通信フロー」・7.3（通知の未読数の取り方）・5.11

やること:
1. 7 決定ログ（絞り込み・その時点のスナップショット）。13 と 19 からの入口をつなぐ
2. 8 通知（冒頭の抜粋・押すと既読にして該当の画面へ）。ナビの未読数（開いたとき・戻ったとき・表示中は60秒ごと）
3. PNL-1 コメントパネル（スレッド・返信・メンション・解決）を、すでにある画面の対象（11・13〜18）に付ける
4. PNL-2 変更履歴パネル（差分・元に戻す・操作全体を戻す・作成の取り消し）を、すでにある画面の対象（11・13〜18）に付ける
5. テスト: Vitest（メンション・元に戻す・作成の取り消しの確認）、E2E（コメントでメンションすると相手の 8 に出る、履歴から戻す、決定ログを開く）

まだ作らないもの: 10〜12（Step 33）、20〜23（Step 34・35）。それらへのパネルは、その画面のステップで付ける。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 33: Should（2）: 10 自己分析ホーム・11 設問フォーム（自己分析）・12 メンバーの自己分析・M6

Status:

```
自己分析の画面を作ってください（PRD 4章の Should）。

参照:
- docs/design-spec.md 6.11（10・12・M6・Viewer として開いたときの移り先）・6.2（11 の自己分析の追加の決まり）・4.1（パターン A・C・D）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.8

やること:
1. 10 自己分析ホーム（11セクションの進み具合・完了・共有先・AI 書き出しの入口）
2. 11 設問フォーム（自己分析）
3. 12 メンバーの自己分析（共有されたものだけ。コメント）と M6 共有先の選択
4. 24・25 の入口（10・11）、PNL-1（10〜12）と PNL-2（10・11）、ナビと 5 からの入口をつなぐ
5. テスト: Vitest（主要な操作と出し分け）、E2E（自己分析に答えて完了し、共有すると Owner が 12 で読めてコメントできる。
   Viewer として開いたワークスペースから自分の個人用ワークスペースへ移る）

まだ作らないもの: 20〜23（Step 34・35）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 34: Should（3）: 20 プランホーム・21 プラン項目の編集・M3・M4・M5

Status:

```
ビジネスプランの画面を作ってください（PRD 4章の Should）。

参照:
- docs/design-spec.md 6.12（20・21・M3・M4・M5）・4.1（パターン A・C）・3.8
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.9（P1〜P8）

やること:
1. 20 プランホーム（30項目の進み具合・検証から引き継いだ数字・版・Go / No-Go・実行管理と Pitch Deck の入口は Step 35 でつなぐ）
2. 21 プラン項目の編集（版の読み取り専用の表示を含む）
3. M3 版の保存、M4 Go / No-Go、M5 プラン下書きの作成（19 の Proceed の後・13・20 からの入口）
4. 24・25 の入口（20・21）、PNL-1・PNL-2（20・21）をつなぐ
5. テスト: Vitest（主要な操作と出し分け）、E2E（19 で Proceed → M5 で下書き → 21 で答える → M3 で版を保存 → M4 で Go / No-Go）

まだ作らないもの: 22・23・M8（Step 35）。

make test-e2e で上の流れが通り、make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 35: Could: 22 実行管理・23 Pitch Deck・M8 テンプレートの移行

Status:

```
残りの画面を作ってください（PRD 4章の Could）。これで Web の全画面がそろう。

参照:
- docs/design-spec.md 6.13（22 実行管理）・6.14（23 Pitch Deck）・6.0.7（M8 テンプレートの移行）・4.1（パターン D・I）
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・5.9（P9〜P13）・5.12（T1・T2）

やること:
1. 22 実行管理（マイルストーン・ローンチ計画・KPI・Open Questions・Next Actions。担当・期限・状態）
2. 23 Pitch Deck（1分版と5分版・版の表示・PDF の書き出し）
3. M8 テンプレートの移行（10・13・20 からの入口）
4. 20 からの 22・23 の入口、PNL-1（22・23）と PNL-2（22）をつなぐ
5. テスト: Vitest（主要な操作と出し分け）、E2E（実行管理の項目を足して期限と状態を変える、Pitch Deck を開いて PDF を書き出す、
   M8 で新しい版へ移り、引き継げない回答の表示を確かめる、Viewer は読み取りだけ。screen_flow.mermaid の全遷移（29・30 を除く）を辿る E2E）

まだ作らないもの: PWA（Step 36）。

screen_flow.mermaid の全遷移（29・30 を除く）がたどれ、design-spec 3章の全画面・モーダル・パネル（29・30 を除く。Step 42）が開き、
make test-e2e・make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 36: PWA

Status:

```
docs/02-01_system-design-doc.md ADR-031 に従って、Web を PWA にしてください。

参照:
- docs/02-01_system-design-doc.md ADR-031・ADR-004（静的ファイルの配信とキャッシュの見出し）・7.2（セキュリティヘッダー）・
  2章（WEB_DIST_DIR・PWA の検査のポート 3200）・10章（PWA と配信の行）
- docs/design-spec.md 6.0.6（新しい版がある・ホーム画面への追加の案内）・6.0.1

やること:
1. Service Worker（vite-plugin-pwa の injectManifest）: 画面の外側だけをキャッシュし、/api/* はキャッシュしない。
   ナビゲーションはネットワークを先に使い、オフラインのときだけ _shell.html。新しい版の再読み込みを利用者が選ぶ
2. マニフェストとアイコン（Step 4 の生成物を /manifest.webmanifest と /icons/ に出す）、iPhone の Safari だけの案内
3. API の静的ファイルの配信（ADR-004・ADR-031 の Content-Type とキャッシュの見出し、_shell.html、404、HTML の meta 要素）
4. テスト: 10章の「PWA と配信」の行（Playwright と Bun test。make build-web の結果を WEB_DIST_DIR で渡した API に対して）
5. make test-e2e が PWA の検査の前に make build-web SHA=dev を動かすようにする（SDD 2章「make ターゲット」の test-e2e。
   Step 1 の Makefile には入れていない。build-web は / のルートができる Step 24 まで失敗し、Step 19〜23 の make test-e2e を止めるため）

まだインフラ（Step 40）は作らない。

make build と make build-web が通り、その結果を API から返す形で 10章の PWA と配信の検査（CDP の Page.getInstallabilityErrors が
空など）がすべて通り、make test・make test-e2e・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 37: 仕上げ（1）: E2E の受入スイート

Status:

```
E2E の受入スイートを仕上げてください。

参照:
- docs/02-01_system-design-doc.md 10章（E2E の行）
- docs/design-spec.md 2.3（コアフロー）
- docs/01_prd.md 4章

やること:
1. コアフロー（アイデアの作成 → 回答と根拠 → 費用 → 損益 → 判定 → プラン下書き → 版の保存 → Go / No-Go → Pitch Deck の PDF）を
   1本の E2E にする。受入スイートを兼ねるので、実装の内部ではなく仕様の振る舞いで書く
2. 10章の E2E の行のほかの項目（招待からの新規登録、Viewer の読み取り専用、AI 書き出し → 取り込み、アカウントの削除）が、
   各画面のステップの E2E にあるかを確かめ、無いものを足す
3. 主要な画面の axe の検査（@axe-core/playwright）。見つかった違反を直す

まだ作らないもの: Step 40〜44 の対象（Dockerfile・Terraform・CI/CD・29・30・本物の環境での確認）。

make test-e2e がすべて通り、axe の検査に違反が無い状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 38: 仕上げ（2）: カバレッジと性能

Status:

```
テストのカバレッジと性能を、docs の目標に合わせてください。

参照:
- docs/02-01_system-design-doc.md 10章（カバレッジの目標）・7.3（性能）

やること:
1. 10章のカバレッジの目標を測る: packages/domain の行 95%、API の行と関数それぞれ 80%、Web の主要な部品 60%。足りなければテストを足す
2. 7.3 の性能の目安のうち、手元で測れるもの（シードのデータでの API の応答時間など）を測り、届かないものは原因を直す。
   本物の環境でしか測れないもの（Cloud Run の0台からの起動、スマホの回線での表示）は Step 43 で測る

まだ作らないもの: Step 40〜44 の対象（Dockerfile・Terraform・CI/CD・29・30・本物の環境での確認）。

10章のカバレッジの目標をすべて満たし、7.3 の手元で測れる目安に届き、make test・make test-e2e・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 39: 仕上げ（3）: docs との突き合わせと README

Status:

```
実装全体を docs と突き合わせ、欠けや食い違いを閉じてください。

参照:
- docs/01_prd.md 4章（全ストーリー）
- docs/design-spec.md 3章（全画面・モーダル・パネル）と 6章
- docs/02-01_system-design-doc.md 5.3（全エンドポイント）・7.1・7.2・8章・9章・11章

やること:
1. 独立したレビュアーを観点ごとに分けて同時に起動し（PRD のストーリー・画面と振る舞い・API と権限・セキュリティとエラー・i18n と書式・監視）、
   それぞれが「どの実装とテストで満たしているか」を突き合わせる
2. 見つかった欠けと食い違いを直す。仕様を弱めないと閉じられないものは、自分で決めずに止める
3. README.md（リポジトリの直下。docs への入口だけを書き、docs の中身は写さない）

まだ作らないもの: Step 40〜44 の対象（Dockerfile・Terraform・監視とアラート・CI/CD・29・30・本物の環境での確認）。
突き合わせではそれらを除き、どのステップが持つかを確かめるだけにする。

突き合わせで見つかった欠けがすべて閉じ、make test・make test-e2e・make typecheck・make lint・make doc-lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 40: インフラ（Dockerfile と Terraform）

Status:

```
Web と API を1つにしたイメージと、Google Cloud の資源を Terraform で作ってください。
実際のクラウドへの apply は Step 43 で人が行う。このステップでは本番の資格情報を使わない。

参照:
- docs/02-01_system-design-doc.md 2章（インフラ管理・環境と命名・環境変数・make ターゲット）・ADR-004・ADR-007・ADR-013・
  ADR-015（image と traffic の変更を無視する・bootstrap）・ADR-023（ソースマップ）・ADR-024（sharp を最初のイメージで確かめる）・
  ADR-027（WIF は main だけ）・ADR-028・10章（バックアップのテスト）・11章（監視とアラート）
- docs/03_dev-setup.md 5章（IaC と初回のセットアップ。I・J の uptime_check_enabled）
- docs/05_operation-runbook.md（Artifact Registry の整理・アラートの確かめ方）

やること:
1. apps/api の Dockerfile（oven/bun。Web のビルドを入れる。WEB_DIST_DIR・APP_VERSION）と make build-web（release の SHA）・
   make build-api-image（イメージを上げ、ソースマップを Sentry に上げる。SENTRY_AUTH_TOKEN）
2. infra/terraform/modules/ と envs/{shared,staging,production}/: Artifact Registry（古いイメージを消す決まり）・
   Workload Identity Federation（このリポジトリの main だけ）・バックアップと写真のバケット・予算アラート・
   Cloud Run（image と traffic の変更を無視する）・Secret Manager の入れ物・サービスアカウント・ドメインマッピング・
   Monitoring（production だけ。uptime_check_enabled）・初回の bootstrap。tfstate のバケットは backend の部分設定で渡す（backend に変数は使えない）
3. make infra-plan・make infra-apply（ENV ごと）、make deploy-api、make db-backup の中身
4. バックアップのテスト（make test-api。SDD 10章: PostgreSQL 17 のテスト用の DB から pg_dump -Fc で取り、pg_restore で別の DB に戻せる）
5. 確かめ方（本番の資格情報なしで行う。make に無い次のコマンドは確かめるためだけに使ってよい）:
   - docker build と docker run でイメージを手元で起動し、/・/api/health・/manifest.webmanifest が返ること、イメージの中で sharp
     （写真）と react-pdf のフォント（PDF）が動くこと。起動に要る環境変数は SDD 2章のとおりに与え、外部サービスの値は
     テスト用の値にする（何を与えたかを完了報告に書く）
   - 各 envs で terraform fmt の検査と terraform init -backend=false ＋ terraform validate。plan は Step 43 で人が行う

まだ GitHub Actions のワークフロー（Step 41）は作らない。

手元で作ったイメージが上のとおりに動き、3つの envs で terraform validate が通り、バックアップのテストが通り、
make test・make typecheck・make lint が通る状態をゴールとする。{GCP_PROJECT_ID} はまだ未定（SDD 2章）なので、変数のまま書く。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 41: CI/CD（GitHub Actions と昇格の仕組み）

Status:

```
docs/04_deployment-procedure.md 2章のワークフローと、昇格・ロールバックの仕組みを作ってください。

参照:
- docs/04_deployment-procedure.md 2章（パイプライン・ワークフロー・deploy.yml の順番）・4章・5章
- docs/02-01_system-design-doc.md 2章（make ターゲットの promote・promote-check・db-check・kpi、CI のシークレットと変数）・
  ADR-016・ADR-027・11章（KPI）
- docs/01_prd.md 5章（KPI）
- docs/03_dev-setup.md 9章（ブランチ戦略・コミットの件名）

やること:
1. .github/workflows/: ci.yml・build.yml・deploy.yml・db-backup.yml・kpi.yml を 04 2章のとおりに作る。
   ci.yml は promote-check が先で、deploy/ だけの PR はそこまで、ほかは make install の直後に make db-check（BASE は promote-check と同じ）。
   build.yml の make test にも PostgreSQL 17 のサービスコンテナとクライアントを用意する。deploy.yml は検査のジョブとデプロイのジョブ、
   concurrency の queue: max、後の昇格が先に入ったときに終える処理、/api/health の版の確認。pull_request_target と workflow_run は使わない（ADR-027）
2. make promote と make promote-check（scripts/ に TypeScript で。SDD 2章の決まりをすべて）。promote-check は make install の前に動くので、
   Bun に入っている機能だけを使う
3. packages/db/queries/kpi.sql と make kpi（件数だけを数える。SDD 11章・PRD 5章）
4. テスト: promote-check と promote の決まり（一時的な Git のリポジトリで、gh と gcloud は差し替える。正しい昇格・戻す・2つの環境・
   ほかのファイルとの混在・staging に無い SHA・その環境に無い戻し先・最初の昇格・省いた SHA で止まる場合・残っているブランチ）、
   make kpi をテスト用の DB で動かすこと、ワークフローを actionlint（concurrency.queue を知っている版）で検査すること

まだ実際のクラウドには出さない（Step 43）。

make test（scripts と kpi のテストを含む）が通り、make kpi がテスト用の DB で件数の表を出し、actionlint がワークフローに検出を出さず、
make typecheck・make lint・make doc-lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 42: 29 プライバシーポリシー・30 サポート

Status:

```
29 プライバシーポリシーと 30 サポートのページを作り、ほかの画面からのリンクをつないでください。
本文は BCDX が用意する英語の文章（design-spec 9.2）。本文が apps/web/src/content/ に無ければ、仮の文は書かずにこのステップを
blocked にし、理由（BCDX の本文待ち）を書く。本文がそろってから進める。

参照:
- docs/design-spec.md 3.1（29・30）・9.2
- docs/screen_flow.mermaid
- docs/02-01_system-design-doc.md 4章・9章（規約のページの本文）・ADR-004（/privacy・/support をビルドのときに HTML にする）
- docs/03_dev-setup.md 1章（29・30 に使うデザインのスキル）

やること:
1. apps/web/src/content/ の Markdown から、ビルドのときに 29・30 の HTML を作る
2. 1・2 のフッターと 4 からのリンクをつなぐ
3. テスト: E2E（1・2・4 から 29・30 が開く）、make build-web で HTML ができること

まだ staging には出さない（Step 43）。

make build-web で 29・30 の HTML ができ、make test-e2e・make test-web・make typecheck・make lint が通る状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 43: staging に公開する

Status:

```
docs/03_dev-setup.md 5.4 のチェックリストに沿って、staging に Web を公開してください。
このステップはユーザーの操作が要る（アカウントの作成・課金・{GCP_PROJECT_ID} の決定・DNS・シークレットの値の入力）。
シークレットと本番の資格情報はこのセッションに渡さず、ユーザーが自分の端末で入れる（CLAUDE.md）。
無人ループでは動かさない（blocked にする）。アカウントの審査や証明書の発行に日をまたぐことがあるので、5.4 A は早めに始めてもらう。

参照:
- docs/03_dev-setup.md 3.5（スマホの実機での確かめ方）・5.4（A〜K の staging の分）・6章（OAuth）
- docs/04_deployment-procedure.md 3章・4章（チェックリスト・昇格の PR）・6章（デプロイ後の確認）
- docs/05_operation-runbook.md（アラートとバックアップの確かめ方）
- docs/02-01_system-design-doc.md 7.3（性能）・2章（プレースホルダ）

やること:
1. 始める前に、ユーザーが {GCP_PROJECT_ID} を決める。決まったら SDD 2章のプレースホルダの表に書く
2. 5.4 の A〜K を staging について順に、ユーザーと一緒に進める（コマンドを示し、結果を確かめる）
3. staging への最初の昇格（make promote ENV=staging）、運営者の作成、テンプレートの取り込みと公開、04 6章の確認
4. 手元で差し替えて確かめた外部の経路を本物で確かめる: Google ログイン、Resend のメール（許可リスト）、Cloud Storage の写真、
   Web と API の Sentry（7.2 のとおり中身が削られて届くこと。release が SHA で、ソースマップが当たって元のソースの行で読めること）
5. 7.3 の性能の目安のうち本物の環境で測るもの（Cloud Run の0台からの起動・スマホの回線での表示）、PWA の実機での確認（03 3.5）
6. 手順どおりに進まなかった所は、03・04・05 の該当の手順を直す（合意の上で）

まだ production には出さない（Step 44）。

staging で 04 6章のチェックリストがすべて通り、上の 4・5 の確認が済んだ状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```

---

## Step 44: production に公開する

Status:

```
staging で確かめた版を production に公開してください。ユーザーの操作が要る（GitHub の環境 production の承認・シークレットの値の入力）。
無人ループでは動かさない（blocked にする）。

参照:
- docs/03_dev-setup.md 5.4（A〜K の production の分）
- docs/04_deployment-procedure.md 4章（チェックリスト・昇格の PR）・6章
- docs/05_operation-runbook.md 6.2（バックアップ）
- docs/design-spec.md 9.2（29・30 の本文）

やること:
1. 29・30 の本文が入っていること（Step 42）を確かめる（無いまま production に出さない。04 4.1）
2. 5.4 の production の分を、ユーザーと一緒に進める
3. production への昇格（make promote ENV=production）、運営者の作成、テンプレートの取り込みと公開、04 6章の確認
4. db-backup.yml を手で1回動かし、バックアップができることを確かめる（05 6.2）
5. 手順どおりに進まなかった所は、03・04・05 の該当の手順を直す（合意の上で）

これで初期リリースのプロンプト集は終わる。このあとの変更は /draft:feature で行う。

production で 04 6章のチェックリストがすべて通り、db-backup.yml の1回目が成功した状態をゴールとする。

完了の前に、参照した docs の決まりを節ごとに実装とテストに突き合わせ、合わない所は実装を直す（docs を実装に合わせて弱めない）。
仕様を弱める変更は、無人ループでも自分で決めずに止める（blocked と理由）。弱めずに直せる docs の欠けや食い違いは CLAUDE.md と /draft:implement の決まりに従う。
完了報告とコミットの本文に、自分で決めたこと（決めたこと・理由・ほかの選択肢と採らなかった理由・読んだのに書かれていなかった docs の箇所）をすべて書く。
```
