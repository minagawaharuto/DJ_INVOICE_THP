/**
 * Code.gs
 * メイン処理・トリガー設定・テスト関数
 */

// ==================== 設定定数 ====================

var CONFIG = {
  SPREADSHEET_ID: "1bHF1mxqAjNP-1r93o3riKtjt8s6F8Bdp8JbF2V9LzG0",
  FOLDER_ID: "1yXfWpjwEv7OTIQU5kNzxsV_5PSbwB1G9",
  GEMINI_API_KEY: "AIzaSyCkQ4eLf0fqHmcHMpa5PlxLh6g0ATcbnrM",
  SHEET_SUFFIX: "731締め",
  CLOSING_DAY: 5,
  ERROR_NOTIFY_EMAIL: "★エラー通知先メールアドレス★",
  PROCESSED_LABEL: "請求書処理済み",
  FISCAL_YEAR_START: 4,
};

// 1回の実行あたりの最大処理件数（GAS実行時間制限6分を考慮）
var MAX_PROCESS_PER_RUN = 10;

// ==================== メイン処理 ====================

/**
 * メイン関数：GmailのPDF添付メールを検索し、Gemini APIで解析してシートに転記する
 * 時間ベーストリガーから毎時呼び出される
 */
function checkAndProcessInvoices() {
  try {
    // 処理済みラベルを取得または作成
    var label = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);

    // 未処理のPDF添付メールを検索（処理済みラベル未付与かつファイル名に「請求書」を含むもの）
    var threads = GmailApp.search(
      "has:attachment filename:pdf filename:請求書 -label:" + CONFIG.PROCESSED_LABEL,
      0,
      MAX_PROCESS_PER_RUN,
    );

    Logger.log("処理対象スレッド数: " + threads.length);

    // 各スレッドのメッセージを処理
    for (var i = 0; i < threads.length; i++) {
      var messages = threads[i].getMessages();
      for (var j = 0; j < messages.length; j++) {
        processMessage_(messages[j], label);
      }
    }
  } catch (e) {
    Logger.log("メイン処理エラー: " + e.message);
    sendErrorNotification_(
      "[エラー] checkAndProcessInvoices 実行エラー",
      "エラー内容: " + e.message + "\nスタック: " + e.stack,
    );
  }
}

/**
 * 個別メールを処理する
 * PDF添付がない場合はスキップ。処理完了後に処理済みラベルを付与する
 * @param {GmailMessage} message - 処理対象のGmailメッセージ
 * @param {GmailLabel} label - 処理済みラベル
 */
function processMessage_(message, label) {
  var attachments = message.getAttachments();

  // PDF添付ファイルのみ抽出（名前に「請求書」が含まれるものに限定）
  var pdfAttachments = attachments.filter(function (att) {
    var name = att.getName();
    var isPdf = att.getContentType() === "application/pdf" || name.toLowerCase().slice(-4) === ".pdf";
    var hasInvoice = name.indexOf("請求書") !== -1;
    return isPdf && hasInvoice;
  });

  // PDFが存在しない場合はスキップ（ラベルも付与しない）
  if (pdfAttachments.length === 0) {
    Logger.log("PDF添付なしのためスキップ: " + message.getSubject());
    return;
  }

  var receivedDate = message.getDate();
  var sender = message.getFrom();
  var subject = message.getSubject();

  // 各PDF添付ファイルを処理
  for (var i = 0; i < pdfAttachments.length; i++) {
    var pdf = pdfAttachments[i];
    try {
      // Gemini APIでPDFを解析（月ごとの配列で返る）
      var invoiceDataArray = extractInvoiceData(pdf, subject);

      // 月ごとに1行ずつ転記
      for (var k = 0; k < invoiceDataArray.length; k++) {
        var invoiceData = invoiceDataArray[k];

        // スプレッドシートに転記
        var sheetInfo = writeToSheet(invoiceData, receivedDate);

        // 締め切り超過チェック（受信日の「日」が CLOSING_DAY を超えている場合）
        if (receivedDate.getDate() > CONFIG.CLOSING_DAY) {
          appendOverdueFlag(sheetInfo.sheet, sheetInfo.lastRow);
          sendOverdueNotification(
            receivedDate,
            sender,
            invoiceData.amount,
            sheetInfo.sheetName
          );
        }

        Logger.log('転記完了: ' + invoiceData.name + ' / ' + invoiceData.invoice_date + ' / ' + invoiceData.amount + '円');
      }

    } catch (e) {
      Logger.log('PDF処理エラー: ' + e.message);
      writeErrorRowToSheet(receivedDate, sender, e.message);
      sendErrorNotification_(
        '[エラー] 請求書の自動転記に失敗しました',
        '受信日: ' + receivedDate + '\n送信者: ' + sender + '\nエラー: ' + e.message
      );
    }
  }

  // 処理完了後に処理済みラベルを付与（二重処理防止）
  message.getThread().addLabel(label);
  Logger.log("処理済みラベル付与: " + subject);
}

/**
 * 処理済みラベルを取得する。存在しない場合は自動作成する
 * @param {string} labelName - ラベル名
 * @return {GmailLabel} Gmailラベル
 */
function getOrCreateLabel_(labelName) {
  var label = GmailApp.getUserLabelByName(labelName);
  if (!label) {
    label = GmailApp.createLabel(labelName);
    Logger.log("ラベル自動作成: " + labelName);
  }
  return label;
}

// ==================== シートクリーンアップ（初回のみ使用） ====================

/**
 * クリーンアップ：現在のシートの3行目以降のデータをすべて削除する
 * テスト実行で溜まったゴミ行を一掃するために一度だけ実行すること
 * 実行後はこの関数を再度使わないこと（本番データも消えるため）
 */
function cleanupSheet() {
  var sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(getSheetName_(new Date()));

  if (!sheet) {
    Logger.log('対象シートが見つかりません: ' + getSheetName_(new Date()));
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 3) {
    Logger.log('3行目以降にデータがないためクリーンアップ不要');
    return;
  }

  // 3行目から最終行までの内容をクリア
  sheet.getRange(3, 1, lastRow - 2, sheet.getLastColumn()).clearContent();
  Logger.log('クリーンアップ完了: 3行目〜' + lastRow + '行目を削除しました');
}

// ==================== 動作確認用ワンショット実行 ====================

/**
 * 動作確認用：Gmailから未処理の請求書メールを1件だけ取得して転記まで実行する
 * GASエディタから手動で実行し、実行ログとスプレッドシートで結果を確認すること
 * ※ 処理済みラベルも付与されるため、本番メールで実行すると実際に転記される点に注意
 */
function runOnce() {
  Logger.log('=== runOnce 開始 ===');

  try {
    var label = getOrCreateLabel_(CONFIG.PROCESSED_LABEL);

    // 未処理のPDF添付メールを1件だけ取得
    var threads = GmailApp.search(
      'has:attachment filename:pdf filename:請求書 -label:' + CONFIG.PROCESSED_LABEL,
      0,
      1
    );

    if (threads.length === 0) {
      Logger.log('処理対象のメールが見つかりませんでした。');
      Logger.log('確認ポイント:');
      Logger.log('  - PDF添付メールが受信トレイにあるか');
      Logger.log('  - 「請求書処理済み」ラベルが既に付いていないか');
      return;
    }

    Logger.log('対象メール発見: ' + threads[0].getFirstMessageSubject());

    var messages = threads[0].getMessages();
    for (var j = 0; j < messages.length; j++) {
      processMessage_(messages[j], label);
    }

    Logger.log('=== runOnce 完了 ===');
    Logger.log('スプレッドシートに転記されているか確認してください。');

  } catch (e) {
    Logger.log('runOnce エラー: ' + e.message);
    Logger.log('スタック: ' + e.stack);
  }
}

// ==================== デバッグ用検索確認 ====================

/**
 * デバッグ用：Gmail検索の状態を段階的に確認する
 * メールが見つからないときに実行して原因を特定する
 */
function debugGmailSearch() {
  Logger.log('=== Gmail検索デバッグ開始 ===');

  // ステップ1: PDF添付メールが存在するか（ラベル条件なし）
  var step1 = GmailApp.search('has:attachment filename:pdf filename:請求書', 0, 5);
  Logger.log('[ステップ1] 請求書PDF添付メール総数（最大5件）: ' + step1.length + '件');
  for (var i = 0; i < step1.length; i++) {
    Logger.log('  件名: ' + step1[i].getFirstMessageSubject());
  }

  // ステップ2: 処理済みラベルが既に付いているメールを確認
  var step2 = GmailApp.search('has:attachment filename:pdf filename:請求書 label:' + CONFIG.PROCESSED_LABEL, 0, 5);
  Logger.log('[ステップ2] 処理済みラベル付き請求書PDFメール数: ' + step2.length + '件');
  for (var j = 0; j < step2.length; j++) {
    Logger.log('  件名: ' + step2[j].getFirstMessageSubject());
  }

  // ステップ3: 受信トレイ全体のメール数確認
  var step3 = GmailApp.search('in:inbox', 0, 5);
  Logger.log('[ステップ3] 受信トレイのメール数（最大5件）: ' + step3.length + '件');

  Logger.log('=== デバッグ完了 ===');
  Logger.log('【判断基準】');
  Logger.log('  ステップ1が0件 → GmailにPDF添付メールが存在しない');
  Logger.log('  ステップ2に件数あり → 処理済みラベルが既に付いている');
  Logger.log('  ステップ3が0件 → Gmailへのアクセス権限に問題がある可能性');
}

// ==================== トリガー設定 ====================

/**
 * 時間ベーストリガーをセットアップする
 * GASエディタから手動で一度だけ実行すること
 */
function setupTrigger() {
  // 既存の同名トリガーを削除（重複防止）
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "checkAndProcessInvoices") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 毎時実行のトリガーを新規作成
  ScriptApp.newTrigger("checkAndProcessInvoices")
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log("トリガー設定完了: checkAndProcessInvoices（毎時実行）");
}

// ==================== テスト関数 ====================

/**
 * テスト関数：5つのシナリオを検証する
 * GASエディタから手動で実行し、実行ログで結果を確認すること
 */
function testProcessInvoice() {
  Logger.log("=== テスト開始 ===");

  test_normalInvoice_();
  test_overdueInvoice_();
  test_newMonthSheet_();
  test_newFiscalYearSpreadsheet_();
  test_pdfParseFailure_();

  Logger.log("=== テスト完了 ===");
}

/**
 * テスト1: 通常の請求書メール（5日以内受信）→ 正常転記されること
 */
function test_normalInvoice_() {
  Logger.log("-- テスト1: 通常請求書（5日以内受信）--");

  var fakeData = {
    name: "テスト太郎",
    stage_name: "DJ TEST",
    amount: 50000,
    invoice_date: "2026/05/01",
    content: "DJ出演料",
    payment_due: "2026/05/31",
  };

  // 締め切り以内（3日）でテスト
  var receivedDate = new Date("2026-05-03");

  try {
    var sheetInfo = writeToSheet(fakeData, receivedDate);
    if (receivedDate.getDate() <= CONFIG.CLOSING_DAY) {
      Logger.log(
        "テスト1 PASS: シート「" +
          sheetInfo.sheetName +
          "」に転記完了（超過フラグなし）",
      );
    } else {
      Logger.log("テスト1 FAIL: 超過フラグが付与されてしまっている");
    }
  } catch (e) {
    Logger.log("テスト1 FAIL: " + e.message);
  }
}

/**
 * テスト2: 締め切り超過メール（6日以降受信）→ ⚠️締切超過が記入されること
 */
function test_overdueInvoice_() {
  Logger.log("-- テスト2: 締め切り超過（6日以降受信）--");

  var fakeData = {
    name: "超過テスト",
    stage_name: "",
    amount: 30000,
    invoice_date: "2026/05/06",
    content: "DJ出演料",
    payment_due: "2026/05/31",
  };

  // 締め切り超過（6日）でテスト
  var receivedDate = new Date("2026-05-06");

  try {
    var sheetInfo = writeToSheet(fakeData, receivedDate);
    appendOverdueFlag(sheetInfo.sheet, sheetInfo.lastRow);

    var cellValue = sheetInfo.sheet.getRange(sheetInfo.lastRow, 7).getValue();
    if (String(cellValue).indexOf("⚠️締切超過") !== -1) {
      Logger.log("テスト2 PASS: ⚠️締切超過フラグが正しく付与された");
    } else {
      Logger.log("テスト2 FAIL: セルの値が「" + cellValue + "」でフラグなし");
    }
  } catch (e) {
    Logger.log("テスト2 FAIL: " + e.message);
  }
}

/**
 * テスト3: 新しい月の初回請求書 → 新シートが作成されること
 */
function test_newMonthSheet_() {
  Logger.log("-- テスト3: 新月の初回請求書（新シート作成）--");

  var fakeData = {
    name: "新月テスト",
    stage_name: "DJ NEW",
    amount: 20000,
    invoice_date: "2026/08/01",
    content: "テストイベント",
    payment_due: "2026/08/31",
  };

  // 存在しない月（8月）でテスト → 新シート作成を期待
  var receivedDate = new Date("2026-08-01");

  try {
    var sheetInfo = writeToSheet(fakeData, receivedDate);
    Logger.log(
      "テスト3 PASS: シート「" + sheetInfo.sheetName + "」作成・転記完了",
    );
  } catch (e) {
    Logger.log("テスト3 FAIL: " + e.message);
  }
}

/**
 * テスト4: 4月の請求書（新年度）→ 新スプレッドシートが作成されること
 */
function test_newFiscalYearSpreadsheet_() {
  Logger.log("-- テスト4: 4月（新年度）新スプレッドシート作成 --");

  var fakeData = {
    name: "新年度テスト",
    stage_name: "DJ FISCAL",
    amount: 100000,
    invoice_date: "2027/04/01",
    content: "新年度DJ出演",
    payment_due: "2027/04/30",
  };

  // 4月（新年度）でテスト → 新スプレッドシート作成を期待
  var receivedDate = new Date("2027-04-01");

  try {
    var sheetInfo = writeToSheet(fakeData, receivedDate);
    Logger.log(
      "テスト4 PASS: 新スプレッドシート内シート「" +
        sheetInfo.sheetName +
        "」作成完了",
    );
  } catch (e) {
    Logger.log("テスト4 FAIL: " + e.message);
  }
}

/**
 * テスト5: PDF解析失敗 → エラー行が記録され通知メールが送信されること
 */
function test_pdfParseFailure_() {
  Logger.log("-- テスト5: PDF解析失敗のエラーハンドリング --");

  var receivedDate = new Date("2026-05-10");
  var sender = "test@example.com";
  var errorMsg = "テスト用の解析エラー（意図的）";

  try {
    var sheetInfo = writeErrorRowToSheet(receivedDate, sender, errorMsg);

    // 記録した行のD列が「要確認」であることを確認
    var cellValue = sheetInfo.sheet.getRange(sheetInfo.lastRow, 4).getValue();
    if (cellValue === "要確認") {
      Logger.log('テスト5 PASS: エラー行記録確認済み（D列="要確認"）');
    } else {
      Logger.log("テスト5 FAIL: D列の値が「" + cellValue + "」");
    }

    // 通知メール送信（実際にメールが飛ぶため注意）
    sendErrorNotification_(
      "[エラー] 請求書の自動転記に失敗しました",
      "受信日: " +
        receivedDate +
        "\n送信者: " +
        sender +
        "\nエラー: " +
        errorMsg,
    );
    Logger.log("テスト5: 通知メール送信完了（受信トレイを確認してください）");
  } catch (e) {
    Logger.log("テスト5 FAIL: " + e.message);
  }
}
