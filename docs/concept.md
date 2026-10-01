# コンセプト: moonx

## 一言でいうと

地方で地元ビジネスを始めたい人が、自己分析からアイデア検証、ビジネスプランまでを、スマホとWebで迷わず進められる起業検討アプリ。

## 誰のために

- 中心の利用者: 地方都市（例: フィリピンの Bacolod）で、店舗や実業などの地元ビジネスを始めたい人。個人でもチームでもよい
- 最初の利用者: 同じ手順を Google Drive で回している自分たち（BCDX の創業メンバー）
- 社内専用のツールにはせず、最初から一般向けとして設計する

## どんな課題を解決するか

BCDX は「自己分析 → アイデア検証 → ビジネスプラン」の手順を Google Docs / Sheets のテンプレートで回している。汎用ツールのため、次の負担がある。

- 工程間の転記と全体把握: 検証シートの数字や顧客・課題を、ビジネスプランへ手で写している。複数アイデア・複数メンバーの進み具合を一覧できない
- 検証の抜け漏れ: 最低限の確認項目と、Fact / Assumption / Unknown の区別がどこまで済んだかが分かりにくい。確認項目は、競合・代替3〜5件、地元の価格帯、初期費用と月額費用、損益分岐量、許認可、需要か課題の外部シグナル1件以上
- スマホでの入力: 結合セルの多い大きな表や長いドキュメントを、モバイルから埋めにくい

## どんな体験を提供するか

- 自己分析も検証も、1問ずつカード形式で答えられる。スマホの空き時間に少しずつ進め、続きは Web の大きな画面で開ける
- コストと価格を入れると、損益分岐・シナリオ（Conservative / Expected / Strong / Capacity Limit）・投資回収がその場で計算される
- アイデアごとに、必須の確認項目の達成状況と Fact / Assumption / Unknown の内訳が見える。点数は付けず、足りないものを状態として示す（現行の原則「恣意的なスコアで選ばない」に従う）
- 検証で Proceed にしたアイデアは、主要な数字・顧客・課題がビジネスプランの下書きに引き継がれる。数字の正は検証データに置き、プランは要約だけを持つ
- 考えを深めたいときは、設問と回答を外部の AI に渡せる形で書き出せる。AI との対話で整理した答えをアプリに記入する

## なぜ作るのか

主な目的は、自分たち（BCDX）の起業検討を回しやすくすること。自分たちで使いながら一般にも公開し、地方で起業を考える人の役に立てる。公開は、地元への貢献と実績づくりを兼ねる。

## 思いついているアイデア

- Web とモバイルの両方で使える（技術選定は Phase 3）
- アプリの骨格は、現行の3つのテンプレート
  - Self Analysis: 36問（WHY / BE / DO / GIVE / HAVE / PERSONAL INCOME / ENOUGH / NOT / NOW / FINAL REFLECTION / ONE-SENTENCE）
  - Business Idea & Validation: 00 Summary から 10 Final Assessment までの11シート
  - Business Plan: Part A（Business Case）と Part B（Execution Plan）の30項目
- テンプレートの EXAMPLE を、各設問のヒントとして表示する
- 現行の手順から引き継ぐ原則
  - 自己分析は各自で完了させてから、グループで議論する
  - 1人が複数のアイデアを出してよく、勝者を早く決めない。複数のアイデアがプランに進んでよい
  - Proceed は「プランに進める価値がある」という意味で、立ち上げの承認ではない
  - 検証の根拠を Research Log に残し、他のメンバーが後から確かめられるようにする
  - Pitch Deck は Business Plan から派生させ、別の正にしない（アプリで扱うかは未定）
- 金額は PHP を既定にする
- AI はアプリに組み込まない。入力・計算・進捗の可視化に集中する。ただし、考えを深めるために外部の AI（ChatGPT・Claude など）を使うことは推奨する
- AI 向けエクスポート: テンプレートの設問、これまでの回答、対話用プロンプト（現行の initialize prompt に相当）を、AI にそのまま渡せる形で書き出す
- 未定（Phase 1 で詰める）
  - 既存の Google Drive データとの関係（移行・同期・書き出し）
  - UI の言語（英語・タガログ語・日本語など）
  - チーム内の権限と共有範囲（自己分析の公開範囲を含む）
  - AI 向けエクスポートの形式と、AI で整理した回答をアプリに戻す方法（貼り付け・取り込み）
  - 収益化の有無
- 参照: 現行の BCDX ワークスペース（Google Drive）
  - フォルダ: https://drive.google.com/drive/folders/11ZEkDvx_h1nx92bqiTywjqmBm13ddOhi
  - README（手順と原則）: https://docs.google.com/document/d/10uxF7SXIaEyHwaZcOzRHCKgnqikRHtFag-wMMhoNOYY/edit
  - _initialize prompt（自己分析の対話用プロンプト）: https://docs.google.com/document/d/1scNKIvUt7HbjJMt0vMImAWIUIxVvcYOsZ3W6EPDgdgw/edit
  - _TEMPLATE - Self Analysis: https://docs.google.com/document/d/1Vl5d2lR-ZCxatsSNllqULPFdaB1EXWib5wmU4iqUC20/edit
  - TEMPLATE - Business Idea & Validation: https://docs.google.com/spreadsheets/d/1cIUjcOOop3xSyxUK-Vg36pJ--8lQKFX1uNHKhAXxKJs/edit
  - TEMPLATE - Business Plan: https://docs.google.com/document/d/1q6Mfn8kprXpV74QMx6sKE_6EusH-aLcgW1H2O7WaBDM/edit
