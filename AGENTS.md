# birth-finance-app（劇団Birth 公演収支管理）

> このファイルは、過去のAIセッションが失われたため、`HANDOFF.md`・ソース・Git履歴から 2026-10-13 に再構成した引き継ぎ文書です。詳細な仕様・ロジック・過去の罠は **`HANDOFF.md`** を必ず併読すること。
> AIエージェント（Codex等）は本ファイル `AGENTS.md` を最初に読むこと。新PCでの環境構築手順は `SETUP.md`。

## 姉妹システム構成（2アプリ共通DB）

劇団Birthの運営用に、役割別で2つのNext.jsアプリを運用している。**同一のNeon PostgreSQL DB**（`ep-wandering-credit-a1iizr7u` / ap-southeast-1 / DB名 neondb）を共有している。

| | birth-finance-app（公演収支管理） | birth-schedule-app（稽古スケジュール） |
|---|---|---|
| ローカル | `C:\ClaudeWorks\birth-finance-app` | `C:\ClaudeWorks\birth-schedule-app` |
| 役割 | 売上CSV取込・キャスト精算・経費・協賛金・グッズ・収支 | 稽古日程・キャスト別の参加可否（OK/NG/時間限定）管理 |
| 本番 | https://birth-finance-app.vercel.app | Vercel プロジェクト `birth-schedule-app`（URLは Vercel で確認） |
| Git | GitHub `kazyss1008-sudo/birth-finance-app`（main） | GitHub `kazyss1008-sudo/birth-schedule-app`（main・private。2026-10-13 に新規作成） |
| Cookie名 | `birth_finance_session` | `birth_schedule_session` |

共有テーブル: users / performances / performance_stages / casts / ticket_back_rules / sales* / expenses / expense_categories / settlements / sponsorships / goods / goods_sales
schedule 専用: `rehearsals`, `cast_schedules`, enum `ScheduleStatus`、および `casts.role_name` 列（schedule 側で追加）

ユーザー(users)・公演(performances)・キャスト(casts)は両アプリで共通。ログインID/パスワードも共通（bcrypt）。

### ⚠ 共通DBの取り扱い注意（最重要）
1. **スキーマの正は「schedule-app の schema.prisma」（finance の上位互換）。** finance 側の schema.prisma は schedule 専用の `rehearsals` / `cast_schedules` / `casts.role_name` / `ScheduleStatus` を知らない。
2. **マイグレーションは finance-app の `prisma/migrations` だけが管理**している（9本）。schedule-app には migrations フォルダが無く、schedule 専用テーブルは `prisma db push` 等で DB に直接作られた経緯と思われる（要確認）。
3. したがって **finance 側から `prisma migrate dev` / `prisma db push` を実行すると、schedule 専用テーブル・列の削除を提案される／実行される危険がある。** 実行前に必ず差分を確認し、`--accept-data-loss` は使わない。
4. 共有テーブルのスキーマ変更をするときは、**両アプリの schema.prisma を同じ内容に揃える**こと。変更後は両アプリをビルド確認する。
5. `package.json` の build は `prisma generate && prisma migrate deploy && next build`。schedule 側は migrations が無いので `migrate deploy` は実質何もしない。
6. 本番DBに直接つながる設定（`.env`）なので、ローカル開発中の書き込みも本番データに反映される。破壊的なスクリプト実行前は必ずユーザーに確認する。
7. 会社ネットワークからは Neon の 5432 ポートに直接接続できない（マイグレーション/seed は自宅 or Vercel 経由）。

### 既知の相違・技術的負債（引き継ぎ時点で発見）
- **Prismaドライバー不一致**: finance は `PrismaNeon`（WebSocket、トランザクション可）。schedule の `lib/prisma.ts` は `PrismaNeonHttp`（トランザクション不可）。schedule 側で `$transaction` や `update+include` を使うと 500 になる恐れがある。必要になったら WebSocket 版へ揃える。
- **セッションCookieの署名**: finance-app は 2026-10-13 に HMAC 署名付きへ対応済み（`lib/session.ts`、`SESSION_SECRET` 使用、middlewareで検証）。**schedule-app は未対応**（Cookie の値が `loginId` そのまま・middleware は認証なし）。schedule-app に導入する場合は、Vercel に `SESSION_SECRET` を新規登録し、finance の `lib/session.ts` を流用できる。公開する画面（キャスト向けURL配布など）の方針を先に決めること。
- **schedule-app の middleware は認証をしていない**（素通し）。各API/ページ側の認証チェック有無は要確認。
- finance の `/quick-expense/[performanceId]` は意図的にログイン不要（公演IDを知っていれば誰でもアクセス可）。

## ユーザーとのコミュニケーション・作業ルール
- ユーザー: 水島 和也（劇団Birthの公演運営担当）。**日本語で応答**する。
- 「私がすべてYesと回答した」と言われたら、質問せずに進める。
- スマホ対応必須（メンバーがスマホで使う）。レイアウト崩れに敏感で、スクリーンショットで確認してもらうことが多い。
- 画面に開発者向けの注記・実装メモを出さない（ユーザー向けの表現にする）。
- ビルド確認（`npx next build`）が通ってから push / デプロイ。
- **Gitのコミット者メールは GitHub の noreply アドレスにする**（PCごとに設定が必要）: `git config user.name "水島 和也"` / `git config user.email "270341803+kazyss1008-sudo@users.noreply.github.com"`。他のメールだと Vercel が「GitHubアカウントと一致しない」としてデプロイを Blocked にする（2026-10-13 に実際に発生）。
- コミットメッセージは日本語。既存履歴は `feat:` / `fix:` + 日本語の要約の形式に合わせる。
- push はユーザーが自分のPCで行うことがある（AI実行環境から GitHub へ push できない場合がある）。その場合は push 用コマンドを案内する。
- Windows 環境（`C:\ClaudeWorks\...`）。**`.env` は開かない・読まない・内容を出力しない・コミットしない**（AI エージェントも同様）。秘密情報（DBパスワード等）を Git・チャット・ログに出さない。
- **ローカルファイルの受け渡しはしない前提**（USB・メール・チャット添付・クラウド共有を使わない）。ソースは GitHub から取得し、`.env` などの秘密情報は新PCで Neon / Vercel の画面から直接作る（`SETUP.md` 3章）。移行後は DB パスワードを再発行して旧PCの `.env` を無効化する（`SETUP.md` 7章）。

## このアプリ（finance）固有の情報

- 技術: Next.js 15.5.x (App Router, TS) / Prisma 6 + `@prisma/adapter-neon`（**`PrismaNeon` WebSocket版必須**。`PrismaNeonHttp` は不可）/ Neon / Vercel(Hobby) / 独自Cookie認証 + bcryptjs
- デプロイ: `main` に push → Vercel 自動デプロイ。事前に `npx next build` で確認。
- 環境変数: `DATABASE_URL`, `DIRECT_URL`, `SESSION_COOKIE_NAME`, `SESSION_SECRET`（ローカル .env と Vercel 両方。現在のローカル .env には DIRECT_URL が無い → ローカルで migrate するなら追加が必要）
- 主画面: /performances（一覧）, /performances/new（4ステップ作成）, /performances/[id]（8タブ: CSV取込/売上/キャスト/バック/グッズ/経費/協賛金/収支）, 精算詳細 `casts/[castId]/settlement`, ギャランティ明細PDF `casts/[castId]/gala`, 予約リスト `reservation-list`（A4横・PDF共有）, /users, /expense-categories, /quick-expense/[performanceId]
- 計算ロジック（バック・ノルマ・収支・CSV取込・時刻はUTCメソッドで表示）は HANDOFF.md 参照。`lib/ticketBack.ts`, `lib/csvImport.ts`。
- 直近の開発（Git履歴 2026-05〜06）: ギャランティ明細PDF（税込明記・ファイル名「[公演名]ギャランティ明細書_[キャスト名]様」）、経費の精算状況フィルタ、予約リストPDF/リピバッジ、精算内訳の表現を一般向けに刷新、等。
- 状態メモ（2026-10-13時点）: Git は main / GitHub と同期済み。署名付きCookie対応済み（本番反映済み）。`HANDOFF.md`（詳細仕様）もコミット済み。


## 2026-10-18 キャスト用ログイン・メール仕様変更（ローカル実装）

詳細・環境変数・本番反映順序は `CAST_SCHEDULE_SETUP.md` を参照。

- 両アプリの `schema.prisma` は現在同一。financeにも既存schedule専用モデルを含めた。追加項目のmigrationはfinance側のみ。本番DBは2026-10-18のfinanceデプロイで反映済み。
- castsにメール、スケジュール用パスワードハッシュ、認証バージョンを追加。収支管理側のキャストタブで一括登録・URLメール送信。
- scheduleの管理者Cookieは署名付きへ変更済み（`admin:`識別子）。`SESSION_SECRET`が必須。旧Cookieは使えずスタッフも再ログインが必要。
- キャストは別Cookie・本人専用APIでログイン/閲覧/保存。既存管理APIはスタッフ認証必須。
- scheduleのPrismaドライバーをWebSocket版`PrismaNeon`へ変更。本人の保存と変更履歴をトランザクション化。
- Resend送信設定とVercel Cronを追加。前日までの本人の変更を翌朝日本時間09時台に1通で通知。Resendの送信設定・実メール確認は別途必要。劇団通知先はtac.birth2003@gmail.com。
- ローカル検証は `prisma generate` と `next build`。`npm run build`はDB migrationを実行するため、検証に使わない。
