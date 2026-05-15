/**
 * SheetManager.gs
 * スプレッドシート・シートの取得/作成/転記処理
 */

/**
 * 受信日に基づいてシートを取得または作成し、請求書データを転記する
 * @param {Object} invoiceData - 請求書データ
 * @param {Date} receivedDate - メール受信日
 * @return {Object} {sheet, sheetName, lastRow}
 */
function writeToSheet(invoiceData, receivedDate) {
  var spreadsheet = getOrCreateSpreadsheet_(receivedDate);
  var sheetName = getSheetName_(receivedDate);
  var sheet = getOrCreateSheet_(spreadsheet, sheetName);
  var lastRow = appendInvoiceRow_(sheet, invoiceData, receivedDate);

  return { sheet: sheet, sheetName: sheetName, lastRow: lastRow };
}

/**
 * PDF解析エラー時のエラー行をシートに記録する
 * @param {Date} receivedDate - メール受信日
 * @param {string} sender - 送信者
 * @param {string} errorMsg - エラーメッセージ
 * @return {Object} {sheet, sheetName, lastRow}
 */
function writeErrorRowToSheet(receivedDate, sender, errorMsg) {
  var spreadsheet = getOrCreateSpreadsheet_(receivedDate);
  var sheetName = getSheetName_(receivedDate);
  var sheet = getOrCreateSheet_(spreadsheet, sheetName);

  var nextRow = getLastDataRow_(sheet) + 1;
  sheet.getRange(nextRow, 2, 1, 7).setValues([[
    receivedDate,
    sender,
    '',
    '要確認',
    '-',
    errorMsg.substring(0, 100),
    '-'
  ]]);

  Logger.log('エラー行記録: 行' + nextRow);
  return { sheet: sheet, sheetName: sheetName, lastRow: nextRow };
}

/**
 * 締め切り超過フラグ（⚠️締切超過）をG列の末尾に追記する
 * @param {Sheet} sheet - 対象シート
 * @param {number} row - 対象行番号
 */
function appendOverdueFlag(sheet, row) {
  var currentValue = sheet.getRange(row, 8).getValue();
  sheet.getRange(row, 8).setValue(currentValue + '⚠️締切超過');
  Logger.log('締切超過フラグ追記: 行' + row);
}

/**
 * シート名を生成する（例: 2026.5 (731締め)）
 * @param {Date} date - 基準日
 * @return {string} シート名
 */
function getSheetName_(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  return year + '.' + month + ' (' + CONFIG.SHEET_SUFFIX + ')';
}

/**
 * 年度を計算する（FISCAL_YEAR_START月始まり）
 * @param {Date} date - 基準日
 * @return {number} 年度
 */
function getFiscalYear_(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  return month >= CONFIG.FISCAL_YEAR_START ? year : year - 1;
}

/**
 * スプレッドシートを取得または作成する
 * 4月（新年度）の場合はFOLDER_IDに新規スプレッドシートを作成する
 * それ以外はSPREADSHEET_IDのスプレッドシートを使用する
 * @param {Date} receivedDate - メール受信日
 * @return {Spreadsheet} スプレッドシート
 */
function getOrCreateSpreadsheet_(receivedDate) {
  var month = receivedDate.getMonth() + 1;

  if (month === CONFIG.FISCAL_YEAR_START) {
    return createFiscalYearSpreadsheet_(receivedDate);
  }

  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

/**
 * 新年度（4月）のスプレッドシートをFOLDER_IDに作成する
 * 同名ファイルが既に存在する場合は既存ファイルを返す
 * @param {Date} date - 基準日
 * @return {Spreadsheet} スプレッドシート
 */
function createFiscalYearSpreadsheet_(date) {
  var fiscalYear = getFiscalYear_(date);
  var ssName = fiscalYear + '年度 請求書管理';
  var folder = DriveApp.getFolderById(CONFIG.FOLDER_ID);

  // 同名スプレッドシートが既に存在するか確認
  var files = folder.getFilesByName(ssName);
  if (files.hasNext()) {
    Logger.log('既存スプレッドシートを使用: ' + ssName);
    return SpreadsheetApp.open(files.next());
  }

  // 新規スプレッドシートを作成
  var newSs = SpreadsheetApp.create(ssName);
  var file = DriveApp.getFileById(newSs.getId());

  // ルートフォルダから指定フォルダへ移動
  folder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  Logger.log('新スプレッドシート作成: ' + ssName);
  return newSs;
}

/**
 * シートを取得する。存在しない場合は新規作成してヘッダーを挿入する
 * @param {Spreadsheet} spreadsheet - スプレッドシート
 * @param {string} sheetName - シート名
 * @return {Sheet} シート
 */
function getOrCreateSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    insertHeaderRow_(sheet);
    Logger.log('新シート作成: ' + sheetName);
  }

  return sheet;
}

/**
 * シートの1行目にヘッダー行を挿入する
 * @param {Sheet} sheet - 対象シート
 */
function insertHeaderRow_(sheet) {
  var headers = ['到着月日', '名前', '芸名', '金額', '請求月日', '内容', '支払い予定'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
}

/**
 * A列を上から走査して最初の空白セルの直前行（＝連続データの末尾）を返す
 * 途中に空白がない前提で上から検索するため、遠くに残ったゴミ行を無視できる
 * @param {Sheet} sheet - 対象シート
 * @return {number} 最終データ行番号（0の場合はデータなし）
 */
function getLastDataRow_(sheet) {
  var values = sheet.getRange('B:B').getValues();
  for (var i = 2; i < values.length; i++) { // 3行目（index=2）から検索開始
    if (values[i][0] === '') return i; // 最初の空白行のインデックス = 直前の行番号
  }
  return values.length;
}

/**
 * 指定日の翌々月末日をYYYY/MM/DD形式で返す
 * 例: 2026/05/13 → 2026/07/31
 * @param {Date} date - 基準日（到着日）
 * @return {string} 翌々月末日（YYYY/MM/DD形式）
 */
function calcPaymentDue_(date) {
  var year = date.getFullYear();
  var month = date.getMonth() + 1 + 2; // 翌々月
  if (month > 12) {
    year += Math.floor((month - 1) / 12);
    month = ((month - 1) % 12) + 1;
  }
  // 翌々月の末日 = 翌々月+1の0日目
  var lastDay = new Date(year, month, 0).getDate();
  return month + '/' + lastDay;
}

/**
 * 請求書データをシートの最終行に追記する
 * @param {Sheet} sheet - 対象シート
 * @param {Object} invoiceData - 請求書データ
 * @param {Date} receivedDate - 受信日
 * @return {number} 追記した行番号
 */
function appendInvoiceRow_(sheet, invoiceData, receivedDate) {
  var nextRow = getLastDataRow_(sheet) + 1;

  // 支払い予定は到着日の翌々月末で上書き
  var paymentDue = calcPaymentDue_(receivedDate);

  sheet.getRange(nextRow, 2, 1, 7).setValues([[
    receivedDate,
    invoiceData.name,
    invoiceData.stage_name,
    invoiceData.amount,
    invoiceData.invoice_date,
    invoiceData.content,
    paymentDue
  ]]);

  // B列（到着月日）の表示フォーマットを M/d に設定
  sheet.getRange(nextRow, 2).setNumberFormat('M/d');

  Logger.log('データ転記完了: 行' + nextRow);
  return nextRow;
}
