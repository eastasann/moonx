# プロトタイプからの引き継ぎ

2026-10-11 にユーザーが、ブランチ `ccr-e898e52c-gcbuzn` の実装（タグ `prototype-2026-10-11`）をプロトタイプと位置づけ、実装をやり直すと決めた。このファイルは、やり直しで設計の docs に移す決定と、プロトタイプで分かったことを持つ。ここに書いた決定は、まだ design-spec・PRD・SDD・03〜05 に入っていない。やり直しの最初にそれぞれの正のドキュメントへ移し、移し終えたらこのファイルを消す。

## 1. 設計の docs に移す決定

決めた経緯と細部は、タグの時点の `claude-code-prompts.md` の Step 17d・17e・18a〜27 にある。

### 配信とドメイン（2026-10-03・10-11）

- クラウドは Google Cloud にまとめる。API の Cloud Run のサービスが、`/*` の静的ファイルと `/api/*` の両方を返す。Cloudflare は使わない。管理するサービスを増やすほどの利点が無いため（ユーザーの判断）
- 独自ドメインは Cloud Run のドメインマッピングで付ける（asia-southeast1 で使える）。Preview の機能で、Google は遅延の問題から本番向けではないとしている。ユーザーはこれを承知で選んだ。問題が出たときの乗り換え先はロードバランサ（同じ形のまま移れる）
- 捨てた案:
  - Cloudflare Workers: DNS が Cloudflare に無いドメインには独自ドメインを付けられない
  - Cloudflare Pages: Vercel の DNS に CNAME を足せば付くが、管理するサービスが1つ増える
  - Firebase Hosting: Cloud Run に渡すとき `__session` 以外の Cookie を落とし、ログインできない（2026-10-01）
  - ロードバランサ＋Cloud CDN: 月 $18 程度かかり、予算（月 $5・$10 のアラート）を超える
- 共有シークレット（Worker と API の間の合言葉）は要らなくなる
- 呼び出し元の IP は、X-Forwarded-For の右端の値（Cloud Run が付ける値）を使う。クライアントが送った左側の値は使わない。Cloud Run の付け方は公式の説明で確かめてから書く
- 回数制限は ADR-029 の③（Cloudflare のレート制限ルール）が無くなり、①②の2段になる（ユーザー承知）
- staging で確かめたイメージをそのまま production に出すので、環境ごとに違う値（Web の APP_ENV と Sentry の DSN）はイメージに焼き込まない。API が HTML を返すときに meta 要素で渡す（CSP の `script-src 'self'` を崩さない）
- セキュリティヘッダー（CSP・HSTS など）は API が付ける
- ドメインは既存の `dwnfrc.app`（Vercel で登録し、DNS も Vercel）のサブドメインを使う。production は `bcdx.dwnfrc.app`、staging は `stg.bcdx.dwnfrc.app`。GitHub の環境・Neon のブランチ・EAS のチャンネルなど、名前の staging はそのまま
- DNS のレコード（Web の CNAME 2つは `ghs.googlehosted.com`、Resend の MX と TXT、DMARC、Search Console の確認の TXT）は Vercel の画面で手で入れる。Vercel のトークンはチームの全プロジェクトを触れるので、Terraform にも手元にも持たせない
- ドメインマッピングを作る Google アカウントは、Search Console で `dwnfrc.app` の所有を確認しておく

### 公開の範囲と順番（2026-10-11）

- 最初に公開するのは Web だけで、PWA にする（スマホではホーム画面に追加して使う）
- ネイティブのアプリは最初のスコープで作るが、配らない。Web のデザインの改修が固まってから、その内容で作る
- ネイティブの確認は、Android は開発ビルドを実機に入れ、iOS は Mac のシミュレーターで行う。Apple Developer Program の登録は、ネイティブを配ると決めたときにする
- Web は、ネイティブの実装が終わるのを待たずに公開する

### PWA（2026-10-11）

- オフラインは、画面の外側（`_shell.html`、ビルドしたアセット・フォント・アイコン）だけをキャッシュする。`/api/*` はキャッシュしない。入力には接続が要る（オフラインで入力して後で送る仕組みは作らない）
- iPhone の Safari で開いたときだけ、「ホーム画面に追加」の手順を案内する（閉じられる）。iPhone は追加を勧める表示を自動では出さない
- 新しい版の Service Worker が待っているときは、再読み込みを促す
- iPhone では、メールの招待のリンクはホーム画面のアプリではなく Safari で開く。ホーム画面のアプリと Safari ではログインが別になる（ユーザー承知）
- アイコンは三日月と小さな丸（ユーザーが選んだ案 B）。512 の正方形に、中心 (246, 266) 半径 150 の円から中心 (300, 215) 半径 132 の円を抜いた三日月と、中心 (378, 150) 半径 28 の丸を置く。地は `surface.canvas`、三日月は `text.primary`、丸は `accent.default`。色はトークンから作る。maskable の安全域（中心から半径 40%）に収まる
- サービス名は moonx のまま（画面の文、メール、Google の同意画面、PWA の名前）

### デザイン（2026-10-11）

- プロトタイプの見た目は作り直す（ユーザーの判断）。何を変えるかはこれからユーザーと決め、`06_design-tokens.json` と design-spec を直してから実装する

### まだ決まっていないこと

- アプリの ID（`{APP_ID}`）: 案は `app.dwnfrc.bcdx`（staging は `app.dwnfrc.bcdx.staging`）。ネイティブを作るときに要る
- Google Cloud のプロジェクト ID（`{GCP_PROJECT_ID}`）: 世界で重複できず、あとから変えられない
- 5分版の Pitch Deck の Ask / next step のスライドの箇条書きの数（5つ）: 無人ループが「判断待ちなので今の形のまま」とし（Step 13b）、design-spec 6.14 に例外として書いた。ユーザーはまだ決めていない

## 2. プロトタイプで分かったこと

- 画面: design-spec 3章の 28 画面とモーダル M1〜M8 は、Web にすべてある。スマホの幅（390px）では、下のナビの文字が「Self Analy…」「Notificatio…」と切れる（2026-10-11 に確認）
- jsdom: テストでアプリを div の中に描くと、TanStack Router の `__root` が html と body を描くため、オーバーレイを開いたテストが固まった。document に描けば直る（コミット dd73f5c）
- pg_dump: サーバーより古い版の pg_dump は動かない。PostgreSQL 17 に 16 の pg_dump を使うとバックアップのテストが落ちる。手元と CI に 17 の pg_dump が要る
- Playwright: Claude Code のクラウドの開発環境からは cdn.playwright.dev に届かず、入っている Chromium（revision 1194）に合わせて 1.56.1 に固定した（コミット 7bea59d）。手元と CI では要らない
- 手元の PostgreSQL: OS に入っている PostgreSQL が 5432 を使っていると、Docker の PostgreSQL 17 が起動しない。テストが古い版で動いてしまうことがある
- Draft の無人ループ: 子のセッションが長く動くとき、`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` が無いと 600 秒で止まる。駆動スクリプト（`run-loop.sh`）は blocked のステップが1つでもあると止まる
- 無人ループは、仕様より劣化させる判断（運営者の招待の扱い、回数制限の数え方など）を自分でしたことがある。ステップごとに、自分で決めた点を報告させて確かめる
