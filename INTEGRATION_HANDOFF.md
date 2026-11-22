# リリース承認追記（2026-11-22）

水島さんから本チャットでGoLive・リリースの明示承認あり。Gmail所有者設定は本日午後予定。
予約メールの送信状態・再送に加え、送信日時（日本時間）を管理画面へ表示する。
ローカルPostgreSQL 18.7と実PrismaNeonドライバ（localhost WebSocket中継）で、追加migration、旧売上・稽古行保持、20同時申込み/定員10、8並列同一キー再送、snapshot編集・キャンセル・ロールバック・CSV再取込の結合検証が成功。本番へのテスト書込なし。
リリース操作の結果は末尾へ追記する。以下の「未承認/未検証」は実装時点の記録であり、本追記を優先する。

# Birth 統合・チケット実装 引き継ぎ（2026-11-22）

## 現在地と優先事項

今回のユーザー確定要件が旧 HANDOFF/AGENTS より優先。finance を基幹、migration 管理元とする。両 schema.prisma は同一。
作業開始時は両 Git 作業ツリーとも clean。今回の変更はローカル・未コミット。push、デプロイ、本番 DB 接続・書込、メール・LINE 実送信は行っていない。現行 .env は開いていない。
**ローカル実装・隔離検証済みだが、GoLive可能との判定はまだ行っていない。** DB結合検証・所有者のGmail設定・実環境の確認と水島さんのGoが必要。

## 実装

- 管理者: `/performances/{id}/tickets`。一覧・検索・詳細・追加・編集・キャンセル・変更履歴・枚数/残席・URL一覧・メール状態/再送。
- 公演トップからチケット管理、スケジュール管理へ移動。既存売上・経費・協賛金・グッズ・精算は維持。
- 管理スケジュール: `/performances/{id}/schedule`。既存の画面・入力カード・稽古API・LINE設定・Webhook・画像生成・朝/夜Cronを移設。
- キャスト: 既存 `/performances/{id}/cast` と `/cast/{castId}` の認証・本人入力を維持し、`/cast/tickets` へ切替。メール/パスワードは既存 casts の値を使う。新ドメインでは再ログインが必要。
- 購入者: `/reserve/{performanceId}/birth`（劇団）、`/reserve/{performanceId}/{castId}`（キャスト）。管理画面へのリンク、公開予約一覧、購入者編集リンクなし。
- 共通 TicketForm: 初期1カード。追加ボタン、券種・枚数・「リピーター割引」・単価・小計・確認→保存。320pxから対応。
- マスタ: financeのチケット設定で公演名・会場・販売開始JST・受付許可・割引・券種・公演回日付/時間/定員、キャスト・役名。ノルマ/対象者/アカウント設定は既存finance画面。スケジュール側の別キャスト編集タブは統合画面から削除。
- 予約経路と取扱は別。劇団は castId=null。外部サービスの手入力は予約経路と外部予約番号を指定する。券種は削除せず販売停止で運用。

## DB・整合性

finance `20261122000000_ticket_ledger/migration.sql` は本番未適用。

追加: performancesの販売/割引/会場、performance_stagesの開演時刻/定員、ticket_types、reservations、reservation_lines、reservation_history、reservation_mail、line_notification_settings.scheduler_owner。
salesはreservation_id（nullable unique）を追加し、import_history_idをnullableへ緩和。既存行の更新・削除・テーブル再作成なし。SQLはBEGIN/COMMITと5秒のDDLロック待ち上限付き。

予約台帳が正本。予約保存・履歴・既存salesへの集計用1行投影を同一トランザクションで行う。キャンセルで当該投影のみ削除、予約と履歴は残る。従来の集計はこのsalesを使うため、売上・枚数・バック・ノルマ・精算へ反映される。旧CSV売上は変更しない。

公演行FOR UPDATEで予約、定員変更、CSVを直列化。キャスト更新は認証バージョンをロック後にも検査。公演回の所属・取扱の所属・本人所有を検査。最大100枚/予約、30カード/通常入力。管理者も定員超過は不可。
新規はUUID requestKey + 入力ハッシュで再送照合。フォームはsessionStorageにもキーを保持。編集はversionによる競合拒否。クライアント金額は信用しない。

日時: 開催日はDATE、開演はHH:MM。販売開始はJST入力をUTCへ変換。締切は開催日のJST 0:00、境界ちょうど不可。ロック待ち後と処理末尾に再チェック。キャストの回変更は両方の開催日を検査。管理者は時刻制限なし。稽古入力にはチケット締切を適用しない。
既存sales.visited_atは従来のUTC getterで壁時計時刻を表示する慣習に合わせる。新予約の締切計算とは分けている。

価格: 既存カードは名前・基本単価・割引額の保存値を維持。割引チェック解除で保存済み基本単価へ戻る。既存カードの券種変更は不可、カード追加→旧カード削除で最新価格を明示適用。マスタ変更だけでは既存予約を再計算しない。

## CSVの確定した扱い

### 過去の従来CSV公演

従来のCSVタブを保持。取込前に枚数・金額を確認し、既存売上を含めたハッシュで確認後の競合を拒否する。予約が一件でもある公演、または受付許可中は従来全入替を拒否。従来salesだけが再取込対象。
**既存CSV売上がある公演へ新予約を混ぜることは拒否**する。次回公演はチケット販売前なので、新台帳で開始する。過去の公演を予約方式へ変換する必要が出た場合は別途照合移行が必要で、既存売上の自動削除・変換はしない。

### 予約方式公演

チケット管理の「予約CSV取込」。Shift-JIS/UTF-8を選択、最大2MB/1000行。
照合キーは公演＋取込元（手入力時の予約経路と同じ名称）＋予約No。同じキーのCSV由来予約だけ更新。自前予約番号（BIRTH-）の取込を拒否し、手入力済みと同じキーの場合は全体を中止。重複行・曖昧な公演回・取扱不一致・残席不足も全体を中止する。
プレビューのハッシュに予約versionを含め、確定時に再構築して一致を検査。CSVにない行は削除しない。キャンセル済みはキャンセルを維持する。外部サービスでのキャンセルは管理画面で反映する。
異なる取込元名を同一サービスに使うと別販売として扱うため、運用上名称を統一する。顧客名だけの推測による重複削除はしない。

| 現行CSV列 | 予約への対応 |
|---|---|
| 取扱窓口 | キャスト名照合。Web/劇団Birthはnull |
| 予約No | 必須。同一予約の複数券種行をまとめる |
| 公演日時 | JSTの開催日＋開演時刻で公演回を一意照合 |
| 枚数 / 合計額 | 正の整数枚数、非負整数円。合計額を厳密保持 |
| チケット名称 | 既存parserの券種名抽出を維持しsnapshotへ |
| 名前 / 備考 | 購入者名 / 備考 |
| お支払い方法 | 新方式は当日精算。CSV値で決済方式を変えない |
| フリガナ | 新台帳の専用フィールドなし。必要なら備考へ記載して取込 |
| メールアドレス（任意追加） | 連絡先。CSV取込では受付メールを自動送信しない |

旧CSVには基本単価・割引額の確実な情報がないため、券種名に「リピーター」があっても割引を推定しない。合計額÷枚数を基本単価として保存、端数は1円違いの別カードへ分ける。既存集計との金額差を作らない。
拡張CSVは「基本単価」「割引額」「リピーター割引」（有/無）の3列を追加可能。計算結果と合計額が一致する場合だけ、割引snapshotとして保存する。金額・枚数が同一でも、本当に同じ販売かは予約Noと取込元で決定する。

## メール

Gmail SMTPの既存lib/mail.tsを利用。予約メールはGMAIL_USERがtac.birth2003@gmail.comと一致し、パスワードとRESERVATION_MAIL_ENABLED=trueが揃った場合のみ送信する。返信先も同アドレス。別送信元へ自動フォールバックしない。
予約確定後に送信。送信失敗で予約を取り消さない。公開応答は予約番号と送信状態だけ。未設定でも完了画面は予約成立と再予約不要を伝える。
状態: PENDING → SENDING → SENT。未設定UNCONFIGURED、SMTP等の不確実な失敗UNKNOWN。比較更新で同時送信を一つに限定。SMTP Message-IDを固定するがexactly-onceを保証しない。
UNKNOWN/SENDINGの再送はGmail送信済み確認を必須とし、SENDINGは2分以内再送不可。SENT・キャンセル済み予約は再送しない。リクエストが途中終了したPENDING/SENDINGも管理画面で対応可能。
文面は受付時点のsnapshot。後日の編集では自動送信せず、送信済み文面も変えない。再送確認には受付時点の内容である旨を表示する。変更・キャンセル通知は自動配信せず、劇団がメール対応する。
代理入力でメールアドレスがない場合は送信対象外。購入者フォームでは必須。CSVも送信対象外。

所有者待ち: Googleの本人確認→2段階認証→アプリパスワード発行→Vercel Productionへ直接Secret登録。値をチャット/Git/logへ貼らない。GMAIL_USERの値は未確認。実送信・返信受信も未確認。

## 検証と限界

.envを除いた /tmp/birth-validation のコピー、env -i、到達不能なlocalhost DB URL、テスト専用セッション鍵で実施。npm run buildやmigrate deployは未実行。

- Prisma schema validate/generate、既存schemaからのオフラインmigrate diff。新旧差分にDROP TABLE/COLUMNなし。
- finance 70テスト、schedule 36テスト。新規予約・金額・締切・本人境界・競合・CSV・メール状態と既存スケジュール/LINEのモックテスト。
- 両アプリ next build が成功（finance Next 15.5.14、schedule Next 15.5.28）。
- Chrome/Playwright、全APIを架空データに置換。320/390/430/900px、混在カード・確認/確定・メール未設定完了画面、管理者割引解除、URL一覧、本人メニュー、管理者/本人の稽古保存。スクリーンショットは親docs/verification-20261122。
- scripts/verify-isolated.pyで本番設定を読まず再実行可能。NodeがPATHになければBIRTH_NODE_BINARYで指定。

**未検証**: 実PostgreSQLへのmigration適用、実DBドライバでの同時更新・ロールバック・既存データ整合、実SMTP、実LINE、Vercel Cron/redirect実機。DB競合テストはロックを模したテストでありPostgreSQLの証明ではない。開発DBは未準備。本番に検証データを作らない指示を維持している。

## GoLive手順（Goまで実施しない）

1. DBを使用する結合検証の方法を確保し、追加migration・既存データ保持・同時予約・権限・通知を確認する。本番をテスト先にしない。本番接続情報を読み出す必要はない。
2. 両変更をレビュー。既存本番のmigration履歴と、共有scheduleテーブル/列の存在を所有者による読み取り専用確認で照合。古いdb push由来のテーブルがあるため、空DBへの過去migrationだけの再現とは異なる。バックアップを確保。
3. Gmail外部設定と、finance側のBIRTH_APP_URL（正式HTTPS URL）、SESSION_SECRET、CRON_SECRET、LINE_CHANNEL_ACCESS_TOKEN/SECRETを設定。秘密値は所有者が直接入力。SCHEDULE_APP_URLは案内URLのフォールバックなので、BIRTH_APP_URLを優先設定する。
4. finance: TICKETS_PUBLIC_ENABLED=false、RESERVATION_MAIL_ENABLED=false、SCHEDULE_CRON_OWNERは未設定。DBのscheduler_owner初期値はschedule。旧通知を稼働させたまま追加migrationのみfinance管理で適用し、新コードを配備する。Go前のpushは禁止。buildにはmigrate deployが含まれるので、配備とmigrationの順序を意識する。
5. schemaが増えた後、schedule側も本変更を配備する。この時点ではBIRTH_APP_URLをまだ設定せず、既存入力・通知が動くことを確認。両アプリが共有scheduler_ownerを認識する状態が必須。
6. 本番用の公演・キャスト・スケジュール・過去収支を読み取り照合。次回の日時・定員・会場・券種・割引・開始日時を設定。通常運用設定は販売開始前に行う。テスト予約を本番には入れない。
7. 所有者が用意した確認先でGmailとLINEの送受信を確認。RESERVATION_MAIL_ENABLEDを本番のみ有効にする。キャスト案内URLがfinanceになっていることを確認。
8. 通知切替: 旧scheduleのSCHEDULE_CRON_OWNER=financeで旧Cronを停止して反映→financeのSCHEDULE_CRON_OWNER=financeを反映→financeのLINE設定で定時通知担当を「基幹システム」にして保存。DB ownerが一つなので、両新コードの通常Cronが同時送信することはない。送信済みdigest/deliveryを削除しない。WebHookをfinanceへ変更。過去画像URLの有効期限48時間は旧APIを維持（旧LINE secretも維持）。
9. scheduleのBIRTH_APP_URLをfinance正式URLへ設定して反映。旧トップ/公演/キャストURLを307誘導し、既存APIクライアントも適切に誘導。旧マスタ更新payloadは互換性がないので409で止め、基幹へ案内する。
10. 水島さんの最終Goを記録後、financeのTICKETS_PUBLIC_ENABLED=trueを反映。公演の「新規受付を許可」と販売開始日時が揃ってはじめて購入者受付開始。公開許可と日時を混同しない。

## 停止・切戻し

- 公演の「新規受付を許可」をオフ: 購入者/キャスト新規受付停止。既存予約・履歴・管理者操作・キャスト既存予約の期限内変更は保持。
- 全公開停止: TICKETS_PUBLIC_ENABLED=falseを反映。公開画面/APIを停止。全キャスト新規も止めるなら公演の受付許可もオフ。
- 予約後の切戻しは**DB全体を巻き戻さない**。追加テーブル/列と予約・メール・通知履歴を保全。
- 旧financeのCSV全削除コードへ単純に戻してはいけない。予約台帳対応版を管理・閲覧用に維持し、受付だけ停止して修正する。
- スケジュールだけ戻す場合: finance Cronの有効化設定を外し反映→DB ownerをscheduleへ→旧scheduleのBIRTH_APP_URLを外す/旧Cron停止設定を外して反映。本人データは共有DBのまま。送信履歴は残す。
- migration失敗時は破壊的リセットやdb pushを使わない。transactionはロールバックする。migration記録の解決は失敗内容を確認してから実施。

## 2026-11-22 配備方針の更新

Go承認後、finance ProductionにBIRTH_APP_URL（finance正式URL）、TICKETS_PUBLIC_ENABLED=true、RESERVATION_MAIL_ENABLED=trueを登録。公演の受付許可は初期falseであり、券種・開始日時など本番公演設定完了までは新規販売されない。Gmail未設定はUNCONFIGUREDとして予約を保持する。
LINEの既存SecretはVercelから読み出せず、所有者によるfinanceへの設定移行が必要。設定が揃うまでscheduler_owner=schedule、両SCHEDULE_CRON_OWNER未設定を維持する。旧scheduleのBIRTH_APP_URL設定・旧URLの誘導は通知切替時まで保留。基幹内のスケジュール画面は利用可能だが、LINE設定操作は引き続き旧scheduleを使用。新旧でCronを二重稼働させない。

## 2026-11-22 本番反映結果

- finance c1c56b0: Vercel Production AkmaFeuCzQbeHzTi3fzjEnKFwvsQ、Deployment completed。ビルドログで20261122000000_ticket_ledgerとAll migrations have been successfully appliedを確認。
- schedule b04c1c0: Vercel Production 3CydBpw1JrPYu2N9Jwga87x7hM2P、Deployment completed。
- 公開ログイン200、未認証の公演API・本人チケットAPI・本人稽古APIは401。未受付公演の予約APIは404。
- スケジュール通知は従来どおりLINE。メールは予約完了用。LINE実行元は旧scheduleのまま維持。Gmail設定は水島さんが実施後に報告予定。実送信・通知担当移行・旧URL誘導は未完了。

本番管理者ログイン後、次回公演の8公演回、劇団と全キャストの予約URL、既存稽古19日分の入力表示、過去公演のCSV履歴と収支画面を読み取り確認。金額・枚数の全件比較や本番での保存・メール送信は未実施。次回公演は受付許可オフ、券種/会場/開始日時/開演時刻/定員が未設定のため、販売前に設定が必要。デモ料金は登録していない。

## UI統一修正

旧scheduleのcell配色・日別参加者レイアウト・ドラッグ表示CSSを復元（表のCSS moduleは旧版と同一）。Shellに公演共通ナビを追加、チケットも同一ShellとBirth配色/カードへ統一。キャスト・役名の追加編集は既存キャストタブへ集約。DB/API/通知処理の変更なし。隔離環境で70テストとnext build成功。今回の見た目についてブラウザ実機での最終確認は未実施。

## 2026-11-22 キャスト設定統合・販売期間外表示

大メニューはスケジュール、チケット、収支・売上、キャスト、公演一覧。キャスト画面はcast.idをキーに名前・役名・ノルマ・バック対象・メール・パスワードを一枚のカードへ統合。保存は既存cast-accountsのトランザクションで同一レコードへ反映し、空のパスワードは保持。メール重複検査と本人セッション失効は維持。追加・並び替え・一括貼付・URL案内は維持。
公開予約GETは公演の受付停止中も公開情報を返す（全体の緊急公開停止は維持）。フォームの入力は可能、予約ボタンのみ無効化し、指定された販売前/販売終了文言を表示。POSTのサーバー側販売開始・受付許可・当日0時締切は変更していない。73テストと隔離next build成功。本番へのテスト書込みなし。

## 予約ページとチケット小タブ

公演一覧はユーザー確認に基づき選択中の公演回・残席へ誘導（tickets?view=stages）。チケット管理を予約一覧/公演回・残席/予約URL/販売設定/CSV取込へ分割。hiddenで入力中の状態を保持。公開ページは専用ロゴヘッダー・公演案内・フォーム・問い合わせの構成とスマホ用余白へ変更。券種未設定を0円販売と誤認しないよう準備中表示。DB/API/メール/LINEの変更なし。
