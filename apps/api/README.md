# @moonx/api

ElysiaJS（Bun）の API。役割は [SDD 2章「リポジトリ構成」](../../docs/02-01_system-design-doc.md#リポジトリ構成)、読む環境変数は [SDD 2章「環境変数」](../../docs/02-01_system-design-doc.md#環境変数)。

## テスト

Bun test で書く（ADR-022）。`apps/web` と `packages/ui-web` の Vitest とは別のツールなので、書き方が違う。

- import: `import { describe, expect, test } from "bun:test"`
- 置き場所: 対象のファイルの隣に `*.test.ts`
- 実行: `make test-api`（`packages/db` のテストと一緒に動く）。先に `DATABASE_URL_TEST` の DB を作り直すので、`make db-up` で DB を起動しておく
- 設定: 環境変数から読まず、`Config`（`appEnv: "test"`）を組み立てて `createApp()` に渡す。DB・ログ・Sentry も `createApp()` の2つ目の引数で渡す。組み立ては `src/test-app.ts` の `buildTestApp()`（ログの行と Sentry に渡した失敗を配列に集める。プロフィール写真は一時ディレクトリに置き、設定に `avatarBucket` があれば `src/index.ts` と同じく Cloud Storage の保存先にする）を使う
- テストのデータ: `src/test-fixtures.ts` の `testFixtures(db)`（ユーザー・ワークスペースと3つのロール・招待・自己分析・アイデアと検証・プラン）で、テストごとに新しい行を作る。ログインは同じファイルの `signIn()`、Web と同じ形のリクエストは `apiRequest()`、写真のアップロードは `testPng()` と `photoForm()`。ルートを足すテストは `src/test-app.ts` の `buildTestAccess()` で認可のプラグインを作り、`open` などを宣言する
- 権限: エンドポイントを足したら、`src/permissions.test.ts` に SDD 7.1 の行を足す（行の無いルートがあるとテストが落ちる）
- 回数制限: `rate_limits` の数はテストをまたいで残るので、IP は `uniqueIp()` で毎回変える
- 起動の処理（`src/index.ts`）: リポジトリの外を作業ディレクトリにした子プロセスで確かめる。リポジトリの中で動かすと、Bun が直下の `.env` を読む
