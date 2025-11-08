# 現行仕様書

## 1. システム概要
Express アプリケーションが HTTP API と簡易ビュー (`views/index.ejs`) を提供し、Firebase Firestore を永続層としてデバイス登録情報・トーク参加者数を管理します。APNs と Firebase Cloud Messaging (FCM) を利用したプッシュ通知配信を担い、.env で与えられる Firebase/Apple 資格情報によって動作します。

## 2. プロセス構成と依存
- エントリーポイント: `bin/www` が `app.js` を読み込み HTTP サーバーを起動。`PORT`(既定 3000) と `config/timeouts.js` の設定に従い `requestTimeout`/`headersTimeout` を設定。
- Firebase: `firebase` SDK と `firebase-admin` を初期化し、`serviceAccount` は `.env` の `FIREBASE_ADMINSDK_*` 群から生成。
- APNs: `modules/push.js` 内で `apn.Provider` を環境別にキャッシュし、プロセス終了時に `shutdownProviders` でクリーンアップ。
- セッション: `express-session` を `SESSION_SECRET`（未指定時 `change-me`）で初期化。cookie 有効期限は 7 日。

## 3. リクエストライフサイクル
1. `middleware/request-context` が `traceId` を発行し、`X-Trace-Id` ヘッダーと `res.locals` に格納。
2. `middleware/request-timeout` が `APP_REQUEST_TIMEOUT_MS`（既定 28s）の `AbortController` を設定。タイムアウト時は 504 `request_timeout` を返し、進行中の Firestore/Push 呼び出しには `signal` を渡す。
3. `morgan` が `:traceId :method :url :status ...` 形式でリクエストをログ出力。
4. ルーティング: `/` は `routes/index.js` の EJS レンダリング、`/api/*` は `routes/api.js` にマウント。
5. `/api` 配下で発生したエラーは `middleware/api-error-handler` が JSON 応答化。`traceId` と `code` を常に返却し、開発モードのみ `detail`/`stack` を付与。

## 4. Firestore データモデル
- `talks/{talkId}` ドキュメント: `userCount` (number) を保持。
- `talks/{talkId}/users/{userId}` ドキュメント: `deviceToken`, `timestamp`(最後のハートビート), `lastPublishTimestamp`, `type`(Android/iOS/watchOS/watchOS_via_iOS), `env` (`pro` or `dev`), `languageCode` などクライアント送信フィールドを格納。
- `registerDevice` 時にトークが存在しなければ新規作成し、ユーザーカウントをインクリメント。`unregisterDevice` や `deleteUnusedDevices` でゼロになったトークは削除。

## 5. API 仕様（すべて POST `/api/...`、API キー必須）
共通: ボディ `key` またはヘッダー `x-api-key` が `process.env.API_KEY` と一致しない場合 401 `invalid_api_key`。

| エンドポイント | 必須パラメータ | 振る舞い |
| --- | --- | --- |
| `/registerDevice` | `userId`,`talkId`,(`deviceToken` 任意) | Firestore にデバイス情報を保存。`deviceToken` が空ならカウントのみ更新。初回登録時 `lastPublishTimestamp` を 0 にする。 |
| `/unregisterDevice` | `userId`,`talkId` | ユーザードキュメントを削除し、`userCount` を減算。0 件ならトークごと削除。 |
| `/updateDeviceStatus` | `userId`,`talkId` | 既存デバイスに任意フィールドを `merge` 更新し、`timestamp` を現時刻に上書き。 |
| `/pushNewUtteranceNotification` | `userId`,`talkId` | ハートビートが `70s` 以上過去かつ `120 分` 以内のユーザー（または `forcePublishing==='1'` で全員）を抽出し、`lastPublishTimestamp` が `15 分` 以上前の端末にプッシュを実行。送信後 `lastPublishTimestamp` を更新（force 時は更新しない）。 |
| `/deleteUnusedDevices` | (なし) | すべてのトークを走査し、`timestamp` が `120 分` より古い端末を削除。残数に応じて `userCount` を更新またはトークごと削除。 |
| `/pushRemoteNotificationDirectly` | `deviceToken`,`type` | 端末種別ごとに直接プッシュ。Android: FCM 通知タイトル/本文を `languageCode` で多言語化。Apple: `type` に応じてバンドルを選択、`message` 未指定なら既定文。`type` が無効な場合 400。 |

## 6. プッシュ配信仕様
- **Android (FCM)**: `modules/push.sendFirebasePush` が `admin.messaging().send` を実行。`FCM_TIMEOUT_MS`（既定 8s）で `withTimeout` を包む。通知本文は `createAndroidNotification(languageCode)` が ja-* なら日本語、それ以外は英語。
- **Apple (APNs)**: `sendApplePush` が `apn.Provider` を `production` ごとにキャッシュ。`APNS_TIMEOUT_MS`（既定 10s）で送信し、失敗レスポンスを検出するとエラーをスロー。メッセージは `createNewUtteranceMessageForApple(languageCode, type)` が Watch 用文言を切り替える。
- Apple の `bundleId` は `type` ごとに `.env` の `APPLE_IOS_APP_BUNDLE_ID` / `APPLE_WATCHOS_APP_BUNDLE_ID` を参照。`watchOS_via_iOS` も iOS バンドル経由で送る。

## 7. タイムアウトとエラー制御
- `config/timeouts.js` で `APP_REQUEST_TIMEOUT_MS`, `FIRESTORE_TIMEOUT_MS`(既定 5s), `APNS_TIMEOUT_MS`, `FCM_TIMEOUT_MS` を集中管理。環境変数で上書き可能。
- Firestore 操作はすべて `runWithFirestoreTimeout`(=`withTimeout`) 経由で実行し、`res.locals.abortSignal` を渡すことでリクエストキャンセル時に中断される。
- API エラー応答例: `{"traceId":"...","code":"request_error","message":"userId and talkId are required"}`。サーバー例外時は 500 `server_error` でメッセージを伏せる。

## 8. 動作確認フロー
1. `.env` を `_env` を基に作成し、Firebase と Apple 資格情報を設定。
2. `npm install` → `npm start` または `DEBUG=otomi-net:* npm start`。
3. `curl -X POST http://localhost:3000/api/registerDevice -H 'Content-Type: application/json' -d '{"key":"<API_KEY>","userId":"u1","talkId":"t1","deviceToken":"abc","type":"Android"}'` などで登録。
4. Firestore Emulator もしくは本番プロジェクトで `talks/{talkId}` が作成され、`userCount` が増加することを確認。
5. `pushNewUtteranceNotification` を呼び出して対象端末に通知が届くか、FCM/APNs ログで成否を確認。

## 9. 既知の前提・制約
- API キーは単一共有値であり、ロール別権限制御は実装されていません。
- テストスイートは未整備のため、手動テストと Firebase Emulator を用いた検証が前提。
- APNs/FCM 送信結果の永続化やリトライキューは存在せず、1 リクエスト内の `Promise.all` で完了を待つのみです。

本仕様書は `app.js`, `routes/api.js`, `middleware/*`, `modules/push.js`, `config/timeouts.js`（取得日: 現在のリポジトリ HEAD）を基に作成しており、将来の改修時には差分を反映させてください。
