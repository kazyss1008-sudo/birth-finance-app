# 劇団Birth公演収支管理アプリ

Next.js + Prisma + PostgreSQL(Neon想定) で作る MVP スターターです。

## 現在入っているもの
- ログイン画面
- 公演選択画面
- 新規公演作成画面(分割式の土台)
- 公演管理画面
- キャスト精算内訳画面
- Prisma schema
- seed(adminユーザー、経費カテゴリ)
- CSV取込APIの初期実装

## セットアップ
```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

## 初期ユーザー
- login_id: admin
- password: seedでは未設定

実運用前に password_hash を設定する初期化処理を追加してください。

## CSV取込仕様
- CP932想定
- 必須列: 取扱窓口 / 枚数 / 合計額 / 公演日時
- trim後完全一致で cast に紐付け
- 不一致は全体失敗
- 再取込は performance_id 単位で sales を全洗替

## 次に着手すること
1. 初回パスワード設定画面
2. 公演新規作成ウィザードの保存処理
3. 認可・ガード処理
4. 経費/精算 CRUD
5. 集計APIとDB接続の本実装
