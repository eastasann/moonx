# Drive のテンプレートの原本の写し

BCDX の Google Drive にある現行のテンプレートを、2026-10-02 に書き出した写し。テンプレート v1 のシード（`packages/db/seed/templates/`）は、ここから転記する（design-spec 9.3）。

- 層: アーカイブ。Drive の原本が後で変わっても、ここは書き換えない
- 書いてあるのはテンプレートだけ。記入済みの自己分析や検証（利用者のデータ）は入れていない
- 文面は原本のまま。原本が英語なので em dash などもそのまま残している（文体の規約の対象外。拡張子を `.txt` にしているのはそのため）

| ファイル | 原本 | 書き出し方 |
|---|---|---|
| `self-analysis.txt` | `_TEMPLATE - Self Analysis`（Google ドキュメント） | PDF に書き出し、`pdftotext -layout` で文字にした。36問・セクションのガイダンス・EXAMPLE |
| `initialize-prompt.txt` | `_initialize prompt`（Google ドキュメント） | 同上。自己分析を外部の AI と進めるためのプロンプト |
| `business-idea-validation.txt` | `TEMPLATE - Business Idea & Validation`（Google スプレッドシート） | xlsx に書き出し、シートごとにセルの値・数式・結合・入力規則（選択肢）を書き出した。EXAMPLE は原本に無い |
| `business-plan.txt` | `TEMPLATE - Business Plan`（Google ドキュメント） | PDF に書き出し、`pdftotext -layout` で文字にした。§1〜§30 の小項目（Prompt）と Example、表の列 |
| `bcdx-readme.txt` | `README`（BCDX のフォルダの説明。Google ドキュメント） | 同上。手順と原則 |

PDF から書き出したファイルには、ページの区切り（改ページ文字）と、原本の入力欄にあるゼロ幅の空白が残っている。
