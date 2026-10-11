## 概要

<!-- 何を・なぜ変えるか（1〜3行） -->

## 関連ドキュメント

<!-- Feature Design Doc（docs/features/…）や、更新した設計ドキュメント（design-spec・System Design Doc など）へのリンク -->

- 

## 変更内容

- 

## 動作確認

<!-- 実施した確認（make test・make test-e2e、手で確かめた画面と手順、スマホで確かめたなら端末と OS） -->

- 

## チェックリスト

- [ ] セルフレビューした（差分を読み直した）
- [ ] 関連ドキュメントを更新した（変えた事実の正のドキュメント。docs/README.md の所有権マップ）
- [ ] スキーマの変更がある場合、マイグレーションを確かめた（make db-generate の結果を読み、追加 → 移行 → 削除の2段階になっている）
- [ ] make lint・make typecheck・make test が通った

<!--
昇格の PR（deploy/{staging,production}/version を変えるリリースとロールバック）は make promote が作り、本文も make promote が書く（上のテンプレートは使わない）。
本文の中身は docs/02-01_system-design-doc.md 2章「make ターゲット」の promote、人が足すものは docs/04_deployment-procedure.md 4.2・5.1。
-->
