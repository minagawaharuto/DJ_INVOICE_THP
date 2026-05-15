# 請求書自動転記システム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GmailのPDF請求書を定期監視し、Gemini APIで解析してGoogleスプレッドシートへ自動転記するGASシステムを構築する。

**Architecture:** 5ファイル構成のGASプロジェクト。Code.gsがオーケストレーター、GeminiApi.gsがPDF解析、SheetManager.gsがスプレッドシート管理、MailNotifier.gsが通知処理を担当。時間ベーストリガーで毎時自動実行。

**Tech Stack:** Google Apps Script (V8 Runtime), Gemini API (gemini-1.5-flash), Gmail API, Google Sheets API, Google Drive API

---

### Task 1: appsscript.json（GASマニフェスト）

**Files:**
- Create: `gas/appsscript.json`

- [ ] `gas/appsscript.json` を作成する

- [ ] 動作確認: GASエディタに貼り付けてプロジェクト設定が正しく読み込まれることを確認

---

### Task 2: MailNotifier.gs（通知メール送信）

**Files:**
- Create: `gas/MailNotifier.gs`

- [ ] `gas/MailNotifier.gs` を作成する（エラー通知・締切超過通知）

---

### Task 3: GeminiApi.gs（PDF解析）

**Files:**
- Create: `gas/GeminiApi.gs`

- [ ] `gas/GeminiApi.gs` を作成する（Gemini APIへのリクエスト・レスポンス解析）

---

### Task 4: SheetManager.gs（スプレッドシート管理）

**Files:**
- Create: `gas/SheetManager.gs`

- [ ] `gas/SheetManager.gs` を作成する（シート取得・作成・転記・新年度処理）

---

### Task 5: Code.gs（メイン処理）

**Files:**
- Create: `gas/Code.gs`

- [ ] `gas/Code.gs` を作成する（メイン処理・トリガー設定・テスト関数）

---

### Task 6: GASへの貼り付けとセットアップ

- [ ] GASエディタに全ファイルを貼り付け、CONFIGの★箇所を実際の値に書き換える
- [ ] `setupTrigger()` を一度実行してトリガーを設定する
- [ ] `testProcessInvoice()` を実行してログを確認する
