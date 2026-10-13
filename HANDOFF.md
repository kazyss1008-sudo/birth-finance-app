# 劇団Birth公演収支管理 引き継ぎプロンプト

以下を新しいClaudeセッションに貼り付けてください。

---

## プロジェクト概要

**アプリ名:** 劇団Birth公演収支管理
**ローカルパス:** `c:\ClaudeWorks\birth-finance-app`
**本番URL:** https://birth-finance-app.vercel.app
**GitHub:** https://github.com/kazyss1008-sudo/birth-finance-app
**ユーザー:** 水島 和也 (劇団Birthの公演運営担当)

## 技術スタック

- Next.js 15.5.14 (App Router, TypeScript)
- Prisma 6.x + @prisma/adapter-neon (PrismaNeon = WebSocket版)
- @neondatabase/serverless (WebSocketドライバー)
- PostgreSQL on Neon (リージョン: ap-southeast-1 シンガポール)
- Vercel デプロイ（Hobbyプラン）
- 認証: 独自Cookie セッション + bcryptjs (10 rounds)

## 重要な学習事項（過去に踏んだ罠）

### 1. Prisma DBドライバー
- **必須: `PrismaNeon` (WebSocket版) を使うこと**
- `PrismaNeonHttp` はトランザクション未対応で、`update + include` で500エラーになる
- `lib/prisma.ts` で設定済み

### 2. 環境変数（ローカル `.env` と Vercel両方）

**ローカル `c:\ClaudeWorks\birth-finance-app\.env` の中身：**
```
DATABASE_URL="postgresql://neondb_owner:<PASSWORD>@ep-wandering-credit-a1iizr7u-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:<PASSWORD>@ep-wandering-credit-a1iizr7u.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&connect_timeout=30"
SESSION_COOKIE_NAME="birth_finance_session"
SESSION_SECRET="<長いランダム文字列>"
```
※ パスワードとSESSION_SECRETは現在のローカル `.env` から取得して貼ること
※ Vercel側の環境変数は Settings → Environment Variables から確認可能

**Neon DB情報:**
- プロジェクト: ep-wandering-credit-a1iizr7u
- リージョン: ap-southeast-1 (シンガポール)
- DB名: neondb
- ユーザー: neondb_owner
- Pooler endpoint: `ep-wandering-credit-a1iizr7u-pooler.ap-southeast-1.aws.neon.tech` (アプリ用)
- Direct endpoint: `ep-wandering-credit-a1iizr7u.ap-southeast-1.aws.neon.tech` (マイグレーション用)

**Vercel:**
- プロジェクト名: birth-finance-app
- 接続済みGitHubリポジトリ: kazyss1008-sudo/birth-finance-app
- 自動デプロイ: main ブランチへのpushで自動実行
- デプロイトークン不要（GitHub連携で自動）

**GitHub:**
- リポジトリ: https://github.com/kazyss1008-sudo/birth-finance-app
- 所有者: kazyss1008-sudo (水島さん個人アカウント)
- git push の認証情報はOSレベル(Credential Manager)に保存済み

### 3. ビルドコマンド (package.json)
```
prisma generate && prisma migrate deploy && next build
```

### 4. Vercel URL
- 本番URL: `birth-finance-app.vercel.app` ← これを使うこと
- デプロイ固有URL (`birth-finance-9cm7m4t7e-...`) はそのコミット時点で固定されるので注意

### 5. 会社のネットワークから直接Neonに接続できない
- 5432ポートが塞がれている。マイグレーションは自宅 or GitHub→Vercel経由で実施
- ローカル開発はVercel CLIで本番DB接続するか、自宅で

### 6. 時刻表示
- DBには `visited_at` がTIMESTAMPで保存
- 表示はUTCメソッド (`getUTCHours()` 等) を使う。JST変換しない
- CSV取込時の `公演日時` は文字列のまま `new Date()` で保存

## アーキテクチャ

### 主要画面
- `/login` - ログイン (warmup ping実装済み)
- `/setup-password` - 初回パスワード設定
- `/change-password` - パスワード変更
- `/performances` - 公演選択（カードhover/touchでall-data prefetch）
- `/performances/new` - 公演新規作成（4ステップウィザード）
- `/performances/[id]` - 公演管理（8タブ: CSV取込/売上/キャスト/バック/グッズ/経費/協賛金/収支）
- `/performances/[id]/casts/[castId]/settlement` - キャスト精算詳細
- `/users` - ユーザー管理（admin削除不可）
- `/expense-categories` - 経費カテゴリ管理（システム全体設定）
- `/quick-expense/[performanceId]` - ログイン不要の経費簡易登録（公演ごとURL）

### 主要API
- `/api/performances/[id]/all-data` - 統合API（全タブのデータを1回で取得）
- `/api/performances/[id]/summary` - 収支サマリ
- `/api/performances/[id]/casts/[castId]/settlement` - キャスト精算詳細
- `/api/quick-expense/[performanceId]` - 簡易登録用（middleware認証除外）

### データモデル
- `users` (admin=id:1 削除不可)
- `performances` (status: PREPARING/ACTIVE/CLOSED、日付ベース自動切替)
- `performance_stages`
- `casts` (sort_orderあり、ドラッグ&ドロップ並び替え)
- `ticket_back_rules` (段階式バック、都度計算でDB保存しない)
- `sales` / `sales_raw_rows` / `sales_import_histories` (CSV再取込時はperformance単位で全削除→再登録)
- `expenses` (is_provisional / is_settled フラグあり)
- `expense_categories` (isActive で論理削除、システム全体共有)
- `sponsorships` (協賛金)
- `goods` / `goods_sales` (グッズ販売、ステージ別)

## ロジック仕様

### チケットバック計算
都度計算（DB保存しない）。`lib/ticketBack.ts`
```
for each rule:
  applicable = max(min(N, max) - min + 1, 0)
  total += applicable * unit_price
```

### ノルマ控除
「1枚売るたびに1枚分減算」=
```
remainingNorma = max(normaTicketCount - soldTickets, 0)
normaDeduction = remainingNorma * normaUnitPrice
```

### 収支
```
売上 = SUM(sales.salesAmount) + 協賛金 + グッズ売上
最終収支 = 売上 - 経費(暫定含む) - ギャラ
```
※ ギャラ収支は符号反転表示（マイナス=支払、プラス=受取）

### 経費精算サマリ
ユーザー単位で先に集計 → users にleft join。直接joinしないこと（件数掛け算で壊れる）

### CSV取込
- ヘッダー名でマッピング、Shift-JIS対応
- `取扱窓口` で `Web` は劇団Birth売上（castId=null、バック対象外）
- 1件でも不一致あれば全体ロールバック
- `performance_id` 単位で sales を全削除してから再登録（トランザクション必須）

## CSV取込で使う列
- 取扱窓口（castName または "Web"）
- 枚数
- 合計額（カンマ・「円」除去）
- 公演日時 (TIMESTAMP)
- 予約No (reservationNo)
- チケット名称 (`[]`内を抽出→ticketType)
- お支払い方法 (paymentMethod)
- 名前 (customerName)
- フリガナ (customerKana)
- 備考 (note)

## 経費保存の重要パターン

`saveExpense(expenseId, updates)` という統一ハンドラを使用。
インライン編集時、各フィールドのonChangeでローカルstateを更新、onBlur/onClickでsaveExpenseを呼ぶ。
saveExpenseは行の全フィールドをまとめてPUTする（フィールドの保存漏れ防止）。

経費state変更時にuseEffectで収支サマリ(totalExpenses等)をクライアント側で即時再計算。

## 簡易登録URL（ログイン不要）

`/quick-expense/[performanceId]` は middleware で認証除外。
公演管理画面の経費タブにある「📱 簡易登録URL」ボタンでURLコピー可能。
担当者選択はlocalStorageに保存。

## デプロイ手順

```
git add -A
git commit -m "メッセージ"
git push
```
mainへのpushでVercelが自動デプロイ。

## ビルド前の確認

```
npx next build
```
ローカルでビルドが通ることを確認してからpush。

## 既知の制限・未対応

- 個別チケット種別の管理機能なし
- PDF出力なし（仕様外）
- 経費の添付ファイル機能なし
- 簡易登録URLは認証なし（誰でもアクセス可能、トークン化要望が出たら実装）

## 水島さんとのコミュニケーション

- 日本語で応答
- 「私がすべてYesと回答した」= 質問不要で進める指示
- ビルド後はpush（Vercel自動デプロイ）
- スマホ対応必須（メンバーがスマホで使う）
- レイアウト崩れに敏感、スクショで確認してもらう
- タイムスタンプ表示ルールあり（CLAUDE.md参照、JSTで [受信]/[応答]）

## ファイル構成
```
birth-finance-app/
  app/
    api/                    # APIルート
    login/                  # ログイン
    performances/           # 公演関連
      [id]/page.tsx         # 公演管理（メイン画面、1500行+）
      new/page.tsx          # 新規作成ウィザード
      PerformanceCardPrefetcher.tsx
    quick-expense/[performanceId]/page.tsx
    users/                  # ユーザー管理
    expense-categories/     # 経費カテゴリ管理
    setup-password/
    change-password/
  components/
    Shell.tsx               # 共通レイアウト
  lib/
    prisma.ts               # ★PrismaNeon (WebSocket)
    auth.ts                 # セッション管理
    ticketBack.ts           # バック計算
  prisma/
    schema.prisma
    migrations/
    seed.ts                 # admin + 経費カテゴリ初期値
  public/
    logo.png
    manual.html             # 操作マニュアル
  middleware.ts             # 認証ガード
  CLAUDE.md                 # グローバルルール
  HANDOFF.md                # このファイル
```

---

以上を踏まえて、引き続き対応をお願いします。
