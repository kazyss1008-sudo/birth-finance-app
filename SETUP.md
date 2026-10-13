# 新PCでの環境構築手順（birth-finance-app / birth-schedule-app 共通）

旧PCのローカルファイルは移行できない前提の手順です。**復元に使うのは GitHub と、保管しておいた `.env` の値だけ**です。

## 0. 失われるもの / 失われないもの
| もの | 場所 | 備考 |
|---|---|---|
| ソースコード・履歴・マイグレーション・文書 | GitHub | 両アプリとも push 済み |
| `.env`（DB接続情報など） | 旧PCのみ | **Git管理外。下記の入手先から再取得** |
| `.vercel/`（schedule-app） | 旧PCのみ | `vercel link` で再作成可能 |
| `node_modules/`, `.next/` | 旧PCのみ | `npm install` / ビルドで再生成 |
| 本番DBのデータ | Neon | PCに依存しない |

## 1. 必要なもの
- アカウント: GitHub（`kazyss1008-sudo`）/ Vercel / Neon にログインできること
- ソフト: Git for Windows、Node.js（LTS 22 系）、（任意）Vercel CLI `npm i -g vercel`、Codex

## 2. リポジトリを取得
```
mkdir C:\ClaudeWorks
cd C:\ClaudeWorks
git clone https://github.com/kazyss1008-sudo/birth-finance-app.git
git clone https://github.com/kazyss1008-sudo/birth-schedule-app.git
cd birth-finance-app  && npm install
cd ..\birth-schedule-app && npm install
```
（初回 clone/push 時に GitHub のサインイン画面が出たら、ブラウザで認証する）

## 3. `.env` を作る（各アプリのフォルダ直下）
`.env.example` をコピーして `.env` にし、値を埋める。

| 変数 | finance | schedule | 値の入手先 |
|---|---|---|---|
| `DATABASE_URL` | 必須 | 必須 | Vercel の各プロジェクト Settings → Environment Variables、または Neon コンソール（`-pooler` 付きの接続文字列） |
| `DIRECT_URL` | 任意※ | 任意※ | Neon コンソール（pooler なしの接続文字列） |
| `SESSION_COOKIE_NAME` | `birth_finance_session` | `birth_schedule_session` | 固定値 |
| `SESSION_SECRET` | あり（現状コードでは未使用） | なし | Vercel の finance-app の環境変数。無ければ新しいランダム文字列でよい |

※ `prisma migrate` / `prisma db` 系を実行する場合のみ。普段の `npm run dev` では不要。

- 両アプリは**同じ Neon DB**（プロジェクト `ep-wandering-credit-a1iizr7u`、DB名 `neondb`、ユーザー `neondb_owner`、リージョン ap-southeast-1）につなぐ。
- Vercel 上で値が「Sensitive」で表示できない場合は、Vercel CLI の `vercel env pull`（要 `vercel link`）か、Neon コンソールでパスワードを再発行する。**パスワードを再発行したら、両アプリの Vercel 環境変数と全 `.env` を更新し、再デプロイすること**（片方だけ更新すると片方のアプリが落ちる）。

## 4. 動作確認
```
cd C:\ClaudeWorks\birth-finance-app
npx prisma generate
npx next build        # ビルドが通ることを確認
npm run dev           # http://localhost:3000
```
schedule-app も同様。

## 5. Vercel との関係
- finance-app: GitHub `main` への push で自動デプロイ済み（本番 https://birth-finance-app.vercel.app）。
- schedule-app: Vercel プロジェクト `birth-schedule-app` が存在。GitHub 自動デプロイ連携の状態は未確認。ローカルから操作するには `vercel link`（`.vercel` が再作成される）。

## 6. 注意（詳細は AGENTS.md）
- `.env` は本番DBに直結。ローカル操作も本番データに反映される。
- 会社ネットワークからは Neon の 5432 ポートに接続できない（マイグレーション等は自宅 or Vercel 経由）。
- finance 側から `prisma migrate dev` / `db push` を実行すると、schedule 専用テーブルが消える危険がある。実行前に必ず差分確認。
