# moonx — ドキュメント

地方で地元ビジネスを始めたい人が、自己分析からアイデア検証、ビジネスプランまでを、スマホと Web で迷わず進められる起業検討アプリ。

## 読み順

初めて読む人は、この順に読む。

1. `design-spec.md` — 何を作るか（画面・UX・ロール）
2. `01_prd.md` — 誰のために・なぜ・どこまで作るか（ユーザーストーリーと KPI）
3. `02-01_system-design-doc.md` — どう作るか（技術選定・API・データモデル）
4. `03_dev-setup.md` — 手元で動かす
5. 必要になったら `04_deployment-procedure.md`（リリース）・`05_operation-runbook.md`（運用）・`06_design-tokens.json`（見た目の値）

## ドキュメント一覧

| ファイル | 内容 |
|---|---|
| [concept.md](concept.md) | Phase 0 のコンセプトメモ（アーカイブ） |
| [brainstorm-notes.md](brainstorm-notes.md) | Phase 1 の壁打ちメモと、現行の Drive のテンプレートの構成（アーカイブ） |
| [design-spec.md](design-spec.md) | 設計仕様書。画面一覧・画面ごとの仕様・ロールと権限・デザインの方針と部品の一覧・デモデータ |
| [screen_flow.mermaid](screen_flow.mermaid) | 画面遷移図 |
| [01_prd.md](01_prd.md) | PRD。目的・対象ユーザー・ユーザーストーリーと優先度・KPI・スコープ外 |
| [02-01_system-design-doc.md](02-01_system-design-doc.md) | System Design Doc。アーキテクチャ・ADR・ルーティング・API・データモデル（Drizzle）・権限マトリクス・エラー・i18n・テスト・監視 |
| [02-02_feature-design-doc.md](02-02_feature-design-doc.md) | Feature Design Doc の雛形（変更のたびにコピーして使う。中身は空のまま） |
| [03_dev-setup.md](03_dev-setup.md) | 開発環境の作り方・コマンド・ブランチ戦略・クラウドの初期設定 |
| [04_deployment-procedure.md](04_deployment-procedure.md) | デプロイとリリース（ストアを含む）・ロールバック |
| [05_operation-runbook.md](05_operation-runbook.md) | 監視・障害の対処・ログの見方・定期メンテナンス |
| [06_design-tokens.json](06_design-tokens.json) | デザイントークン（色・書体・余白などの具体値。DTCG 形式、ライトとダーク） |

## ドキュメント体系

### 3つの層

| 層 | ファイル | 扱い |
|---|---|---|
| ソース（正） | `design-spec.md`・`screen_flow.mermaid`・`01_prd.md`・`02-01_system-design-doc.md`・`03_dev-setup.md`・`04_deployment-procedure.md`・`05_operation-runbook.md`・`06_design-tokens.json` | 事実ごとに正は1つ（下の所有権マップ）。変更のたびに更新する生きた文書 |
| 派生 | ソースから生成・要約するもの（06 から `make tokens` で作るテーマ `packages/ui-tokens`（vanilla-extract・Unistyles・react-pdf 用）、`make openapi` の書き出し、Phase 4 の実装準備で作るもの） | 直接直さない。ソースを直してから作り直す |
| アーカイブ | `concept.md`・`brainstorm-notes.md` | 決めた経緯の記録。更新しない。今の正はソースを読む |

### 事実の所有権マップ

同じ事実を複数のドキュメントに書かない。別のドキュメントで触れるときは、所有するドキュメントへの参照にする。

| 事実 | 正のドキュメント |
|---|---|
| 画面の存在・目的・レイアウト・認証要否・画面ごとの振る舞い・文言、ロールと権限（画面の単位）、デザインの方針（Spectrum を参考にした仕組みと Hermes Teal の見た目）、部品の一覧（4.5）、デモデータ | `design-spec.md` |
| 画面の遷移 | `screen_flow.mermaid` |
| 目的・対象ユーザー・ユーザーストーリーと優先度・KPI・スコープ外 | `01_prd.md` |
| アーキテクチャ・技術選定（ADR）・環境と命名・環境変数・make ターゲット・ルーティング・API・**データモデル**・権限マトリクス（API の単位）・エラーの形式・i18n・テスト戦略・監視の設計 | `02-01_system-design-doc.md` |
| 開発環境・ツール・ブランチ戦略・クラウドの初期設定の手順 | `03_dev-setup.md` |
| デプロイ・リリース・ロールバックの手順 | `04_deployment-procedure.md` |
| 障害の対処・ログの見方・定期メンテナンスの手順 | `05_operation-runbook.md` |
| 色・書体・余白・角丸・影・動き・スライドの寸法などの具体値 | `06_design-tokens.json` |
| 実際のコマンド | `Makefile`（ドキュメントはターゲット名だけを書く） |
| 個々の変更の設計 | `features/` の Feature Design Doc |

## features/

変更（機能の追加・バグの修正・リファクタ）ごとの Feature Design Doc を、時系列で置く場所。最初の変更のとき（`/draft:feature`）に作る。雛形は `02-02_feature-design-doc.md`。変更が終わったら、決まった事実を上のソースのドキュメントに反映する。

## 省略した成果物

なし（PROJECT-PLAYBOOK の7点をすべて作った）。
