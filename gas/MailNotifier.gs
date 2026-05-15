/**
 * MailNotifier.gs
 * エラー通知・締め切り超過通知メールの送信処理
 */

/**
 * エラー通知メールを送信する
 * @param {string} subject - メール件名
 * @param {string} body - メール本文
 */
function sendErrorNotification_(subject, body) {
  try {
    GmailApp.sendEmail(
      CONFIG.ERROR_NOTIFY_EMAIL,
      subject,
      body
    );
    Logger.log('エラー通知メール送信完了: ' + subject);
  } catch (e) {
    Logger.log('通知メール送信失敗: ' + e.message);
  }
}

/**
 * 締め切り超過通知メールを送信する
 * @param {Date} receivedDate - 受信日
 * @param {string} sender - 送信者メールアドレス
 * @param {number|string} amount - 請求金額
 * @param {string} sheetName - 転記先シート名
 */
function sendOverdueNotification(receivedDate, sender, amount, sheetName) {
  var subject = '[要確認] 締め切り超過の請求書を受信しました';
  var formattedDate = Utilities.formatDate(receivedDate, 'Asia/Tokyo', 'yyyy/MM/dd');
  var body = '締め切り日（毎月' + CONFIG.CLOSING_DAY + '日）を超過した請求書を受信しました。\n\n'
    + '受信日: ' + formattedDate + '\n'
    + '送信者: ' + sender + '\n'
    + '金額: ' + amount + '円\n'
    + '転記先シート: ' + sheetName + '\n\n'
    + 'スプレッドシートの該当行をご確認ください。';

  sendErrorNotification_(subject, body);
  Logger.log('締切超過通知メール送信: ' + sender);
}
