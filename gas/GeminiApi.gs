/**
 * GeminiApi.gs
 * Gemini API呼び出しとPDFからの請求書データ抽出処理
 */

/**
 * Gemini APIを使ってPDFから請求書データを抽出する
 * 明細を月ごとに集計し、複数月にまたがる場合は複数オブジェクトの配列を返す
 * @param {Blob} pdfBlob - PDFの添付ファイルBlob
 * @param {string} subject - メールの件名（参考情報として渡す）
 * @return {Array} 月ごとの請求書データの配列
 */
function extractInvoiceData(pdfBlob, subject) {
  var base64Pdf = Utilities.base64Encode(pdfBlob.getBytes());

  var prompt = '以下のPDFは請求書です。明細行を月ごとに集計して、JSON配列形式で返してください。\n'
    + 'JSONのみを返してください。余分なテキストやコードブロック記号は不要です。\n\n'
    + '返却形式（月ごとに1オブジェクト）:\n'
    + '[\n'
    + '  {\n'
    + '    "name": "請求者の本名",\n'
    + '    "stage_name": "請求者の芸名（なければ空文字）",\n'
    + '    "amount": その月の明細金額の合計（数値のみ。源泉徴収後の合計金額がある場合はそちらを使う）,\n'
    + '    "invoice_date": "その月（M月形式。例: 4月）",\n'
    + '    "content": "件名または品目名（複数の場合はカンマ連結）",\n'
    + '    "payment_due": ""\n'
    + '  }\n'
    + ']\n\n'
    + '【集計ルール】\n'
    + '- 明細の日付が同じ月のものはamountを合計して1オブジェクトにまとめる\n'
    + '- 複数月にまたがる場合は月ごとに別オブジェクトにする\n'
    + '- amountは源泉徴収後の合計金額（合計金額(内税)など）を優先して使う\n'
    + '- payment_dueは空文字のままにしてください（システム側で計算します）\n\n'
    + '【芸名の抽出ルール】\n'
    + '請求者名の直後に改行で別の名前（芸名）が記載されている場合、1行目を name、2行目を stage_name に入れる\n'
    + '例: 「山田太郎\nDJ Taro」→ name: "山田太郎", stage_name: "DJ Taro"\n'
    + '芸名の記載がない場合は stage_name を空文字にする\n\n'
    + 'メール件名（参考情報）: ' + subject;

  var requestBody = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: 'application/pdf',
            data: base64Pdf
          }
        },
        {
          text: prompt
        }
      ]
    }],
    generationConfig: {
      temperature: 0
    }
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='
    + CONFIG.GEMINI_API_KEY;

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  Logger.log('Gemini APIリクエスト送信: ' + pdfBlob.getName());

  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    throw new Error('Gemini APIエラー (HTTP ' + statusCode + '): ' + response.getContentText());
  }

  var responseJson = JSON.parse(response.getContentText());

  var candidates = responseJson.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini APIから候補が返されませんでした');
  }

  var textContent = candidates[0].content.parts[0].text;
  Logger.log('Gemini APIレスポンス: ' + textContent);

  var jsonText = textContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  var parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error('JSON解析エラー。レスポンス内容: ' + textContent);
  }

  // 単一オブジェクトで返ってきた場合も配列に統一する
  var dataArray = Array.isArray(parsed) ? parsed : [parsed];

  return dataArray.map(function(item) {
    return sanitizeInvoiceData_(item);
  });
}

/**
 * 抽出データの検証とサニタイズ
 * 取得できなかった項目は "-" で埋める
 * @param {Object} data - Geminiから取得した生データ
 * @return {Object} サニタイズ済みデータ
 */
function sanitizeInvoiceData_(data) {
  var amount = data.amount;
  if (typeof amount !== 'number') {
    var parsed = parseFloat(String(amount).replace(/[^0-9.]/g, ''));
    amount = isNaN(parsed) ? '-' : parsed;
  }

  return {
    name:         data.name         || '-',
    stage_name:   data.stage_name   || '',
    amount:       amount,
    invoice_date: data.invoice_date || '-',
    content:      data.content      || '-',
    payment_due:  data.payment_due  || '-'
  };
}
