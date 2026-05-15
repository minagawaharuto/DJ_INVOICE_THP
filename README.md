# 請求書自動転記システム (Invoice Auto Transfer System)

このシステムは、Gmailに届いた請求書（PDF）を自動で検知し、Google Gemini APIを活用して内容を解析、その結果をGoogle スプレッドシートに自動転記するGoogle Apps Script (GAS) アプリケーションです。

## 主な機能

- **Gmail監視**: 定期的にGmailをチェックし、「請求書」という文字がファイル名に含まれるPDF添付メールを自動抽出します。
- **AIによるPDF解析**: Google Gemini APIを使用して、PDFの内容から請求者の氏名、芸名、金額、請求日、内容、支払期限を自動で抽出します。
- **スプレッドシートへの自動転記**: 抽出したデータを指定のフォーマットでスプレッドシートに転記します。
- **自動シート・ファイル生成**: 
  - 月ごとに新しいシート（例：`YYYY.M (731締め)`）を自動生成します。
  - 新年度（4月）には、指定したGoogleドライブフォルダに新しいスプレッドシート（例：`YYYY年度 請求書管理`）を自動生成します。
- **締め切り超過チェック**: 毎月指定日（デフォルト: 5日）以降に届いた請求書には、シート上で「⚠️締切超過」のフラグを立て、担当者に通知メールを送信します。
- **エラー通知**: PDFの解析エラーやデータの取得漏れが発生した場合に、管理者へエラー通知メールを送信します。
- **二重処理防止**: 処理が完了したメールには「請求書処理済み」ラベルを自動付与し、重複処理を防ぎます。

## システム要件・技術スタック

- Google Apps Script (GAS)
- Google Gmail API
- Google Drive API
- Google Sheets API
- Google Gemini API

## ファイル構成

```text
gas/
├── Code.gs          # メイン処理（メール検索、全体制御、トリガー設定など）
├── GeminiApi.gs     # Gemini API呼び出し・JSON形式でのデータ抽出処理
├── SheetManager.gs  # スプレッドシートの作成、シート管理、行の追加処理
├── MailNotifier.gs  # エラー通知・締め切り超過通知メールの送信処理
└── appsscript.json  # GASの基本設定・権限スコープマニフェスト
```

## セットアップ手順

1. **Gemini APIキーの取得**
   [Google AI Studio](https://aistudio.google.com/) にてAPIキーを発行します。

2. **環境変数の設定**
   `Code.gs` 内の `CONFIG` オブジェクトをご自身の環境に合わせて書き換えてください。
   ```javascript
   var CONFIG = {
     SPREADSHEET_ID:    '★現在使用中のスプレッドシートID★',
     FOLDER_ID:         '★新年度ファイルの保存先GoogleドライブフォルダID★',
     GEMINI_API_KEY:    '★Gemini APIキー★',
     SHEET_SUFFIX:      '731締め',
     CLOSING_DAY:       5,
     ERROR_NOTIFY_EMAIL:'★エラー通知先メールアドレス★',
     PROCESSED_LABEL:   '請求書処理済み',
     FISCAL_YEAR_START: 4,
   };
   ```

3. **デプロイ**
   claspを使用するか、Google Apps Scriptエディタに直接 `gas/` ディレクトリ内のコードを貼り付けて保存します。

4. **トリガーの設定**
   GASエディタから `setupTrigger` 関数を一度だけ手動で実行します。これにより、1時間ごとに自動で `checkAndProcessInvoices`（メイン処理）が実行されるようになります。

## テスト・デバッグ方法

- **動作確認**: `runOnce` 関数を実行することで、未処理のPDF添付メールを1件だけ取得し、転記プロセスをテストできます。
- **シナリオテスト**: `testProcessInvoice` 関数を実行することで、締め切り超過や新年度のファイル作成、エラー発生などの各シナリオテストが実行されます。
- **メール検索デバッグ**: `debugGmailSearch` 関数を実行すると、Gmailの検索状況（メールが存在するか、ラベルが付与されているかなど）をログ出力で確認できます。

## 注意事項

- GASの実行時間制限（6分）を考慮し、1回の実行あたりの最大処理件数はデフォルトで10件に制限（`MAX_PROCESS_PER_RUN = 10`）されています。
- **対象ファイル**: PDFのファイル名に「請求書」という文字列が含まれている添付ファイルのみが処理対象となります。
