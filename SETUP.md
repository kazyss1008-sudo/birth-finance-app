# 新PCでの環境構築手順（birth-finance-app / birth-schedule-app 共通）

旧PCのローカルファイルは移行できない前提の手順です。**復元に使うのは GitHub と、各サービス（Neon / Vercel）の画面だけ。ファイルの受け渡しはしない**です。

## 0. 失われるもの / 失われないもの
| もの | 場所 | 備考 |
|---|---|---|
| ソースコード・履歴・マイグレーション・文書 | GitHub | 両アプリとも push 済み |
| `.env`（DB接続情報など） | 旧PCのみ | **Git管理外。ファイルは移さず、新PCで Neon コンソールから直接作り直す（3章）** |
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

## 3. `.env` を作る（ファイルを移さず、取得元から直接作る）
**方針: 旧PCの `.env` は新PCへコピーしない。** USB・メール・チャット添付・クラウド共有など、ファイルでの受け渡しは一切行わない。値は取得元のサービス画面（新PCのブラウザ）で確認し、新PCのエディタで直接入力する。`.env.example` をコピーして `.env` にし、値を埋める。

| 変数 | 作り方 |
|---|---|
| `DATABASE_URL` | Neon コンソール → プロジェクト `ep-wandering-credit-a1iizr7u` → Connect → **Pooled connection**（`-pooler` 付きホスト）の接続文字列（パスワードを表示して使う） |
| `DIRECT_URL` | 同じ画面の **Direct connection**（pooler なし）。`prisma migrate` / `prisma db` 系を実行する場合のみ必要。通常の `npm run dev` では不要 |
| `SESSION_COOKIE_NAME` | 固定値（finance: `birth_finance_session` / schedule: `birth_schedule_session`） |
| `SESSION_SECRET` | finance のみ。ローカル用は**新規に生成**してよい（Vercel の値と一致させる必要はない）: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

- 両アプリは**同じ Neon DB**（DB名 `neondb`、ユーザー `neondb_owner`、ap-southeast-1）につなぐ。
- `.env` は Git に入れない（`.gitignore` 済み）。チャット・Issue・コミットメッセージにも貼らない。AI（Codex 等）にも `.env` を開かせない・読ませない。

## 3.5 Git のコミット者メールを設定（重要）
各リポジトリのフォルダで次を実行する。**設定しないと、push しても Vercel のデプロイが「Blocked」になる**（別のメールだと GitHub アカウントと結びつかないため）。
```
git config user.name "水島 和也"
git config user.email "270341803+kazyss1008-sudo@users.noreply.github.com"
```

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

## 7. 移行完了後の後始末（旧PCの `.env` を無効化する）
新PCで動作確認が済んだら、**DB パスワードを再発行**して、旧PCに残る `.env` を使えなくする。ファイルを消す前でも、古い値が無効になるので安全。
1. Neon コンソールでロール `neondb_owner` のパスワードをリセットする。
2. Vercel の**両プロジェクト**（birth-finance-app / birth-schedule-app）の `DATABASE_URL` / `DIRECT_URL`（finance は両方、schedule も両方）を新しい値に更新し、**両方を Redeploy** する。
3. 新PCの `.env` を新しい値に更新する。
4. 旧PC: 2つのアプリのフォルダ（`.env` を含む）を削除し、GitHub / Vercel / Neon / Codex からサインアウトし、Windows の資格情報マネージャーから GitHub の認証情報を削除する。

⚠ 手順 1〜2 の間は本番が一時的に DB へつながらなくなる。**利用者がいない時間帯**に行うこと。
