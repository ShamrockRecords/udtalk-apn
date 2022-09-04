# udtalk-apn

UDトークのプッシュ通知のサーバー側の実装です。

Web APIは4つ

registerDevice
unregisterDevice
updateDeviceStatus
pushNewUtteranceNotification
deleteUnusedDevices（※メンテナンス用）

アプリでトークに参加したタイミングでregisterDeviceを実行します。その後、トークに参加して画面を見ている間はupdateDeviceStatusを1分ごとに呼び出しtimestampを更新します。トークから退出したらunregisterDeviceを実行します。

pushNewUtteranceNotificationは音声認識の結果が生成されるたびに呼び出されます。そのときに

- 最後のupdateDeviceStatusから1分30秒が経過しているときはプッシュ通知を送る
- 以前にプッシュ通知を送ってから15分経過してまだupdateDeviceStatusが呼ばれてなければプッシュ通知を送る
- updateDeviceStatusが最後に呼ばれてから2時間が経過していたらプッシュ通知は以降送らない

これらの条件でプッシュ通知が同じトークに参加している端末に送信されます。

アプリが途中で落ちたり、強制終了した場合などはトークの退出が行われないケースがあるので、数日に一度deleteUnusedDevicesを呼び出しで必要のなくなったデータは削除します。

トークの公開を実装しているサーバー上で動作をさせる実装もあったのですが、そちらにあまり負荷をかけたくなかったのでアプリから実行することでプッシュ通知を送る別サーバーを立てました。UDトークはプライバシー関係で求められるレベルが高いこともあり、新しくサーバーにアクセスをする際に、そこが余計な個人情報を受け取っていないか、保存をしていないかなどクリアするために実装を公開しました。

## 動かし方
1. Node.jsをインストールします

2. npm install

展開後のフォルダで実行します。

3. .envを作成してプロジェクト直下に配置

※_envファイルは雛形ですのでご利用ください

以下の内容をコピーしてプロジェクトのルートフォルダに.envファイルを作成してください。

```
ROOT_URL = "http://localhost:3000"

FIREBASE_API_KEY = ""
FIREBASE_AUTH_DOMAIN = ""
FIREBASE_PROJECT_ID = ""
FIREBASE_STORAGE_BUCKET = ""
FIREBASE_MESSAGING_SENDER_ID = ""
FIREBASE_APP_ID = ""
MEASUREMENT_ID = ""

GOOGLE_CLOUD_TRANSLATION_API_KEY = ""

FIREBASE_ADMINSDK_type = ""
FIREBASE_ADMINSDK_project_id = ""
FIREBASE_ADMINSDK_private_key_id = ""
FIREBASE_ADMINSDK_private_key = ""
FIREBASE_ADMINSDK_client_email = ""
FIREBASE_ADMINSDK_client_id = ""
FIREBASE_ADMINSDK_auth_uri = ""
FIREBASE_ADMINSDK_token_uri = ""
FIREBASE_ADMINSDK_auth_provider_x509_cert_url = ""
FIREBASE_ADMINSDK_client_x509_cert_url = ""
```
### firestoreへのアクセス

firestoreへのアクセス用に発行されたコードを環境変数に移してください。

```
var firebaseConfig = {
    apiKey: "xxxxx,
    authDomain: "xxxxx",
    projectId: "xxxxx",
    storageBucket: "xxxxx",
    messagingSenderId: "xxxxx",
    appId: "xxxxx",
    measurementId: "xxxxx"
  };
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  firebase.analytics();
```
このコードのxxxxxを
```
FIREBASE_API_KEY = "xxxxx"
FIREBASE_AUTH_DOMAIN = "xxxxx"
FIREBASE_PROJECT_ID = "xxxxx"
FIREBASE_STORAGE_BUCKET = "xxxxx"
FIREBASE_MESSAGING_SENDER_ID = "xxxxx"
FIREBASE_APP_ID = "xxxxx"
MEASUREMENT_ID = "xxxxx"
```
このように。

ローカルで動作させるとfirestoreのインデックスを作成するアラートがでるのでエラーメッセージのURLから作成してください。

### firebase adminへのアクセス

firebase adminはサービス アカウントで発行した秘密鍵情報のjsonファイルをダウンロードして入力してください。
AuthenticationのSign-in methodで「メール／パスワード」を有効にしてください。

```
FIREBASE_ADMINSDK_type = ""
FIREBASE_ADMINSDK_project_id = ""
FIREBASE_ADMINSDK_private_key_id = ""
FIREBASE_ADMINSDK_private_key = ""
FIREBASE_ADMINSDK_client_email = ""
FIREBASE_ADMINSDK_client_id = ""
FIREBASE_ADMINSDK_auth_uri = ""
FIREBASE_ADMINSDK_token_uri = ""
FIREBASE_ADMINSDK_auth_provider_x509_cert_url = ""
FIREBASE_ADMINSDK_client_x509_cert_url = ""
```

### 動作させるドメイン

動作させるドメインを入力してください。

`ROOT_URL = "http://localhost:3000"`

Heroku等で動かす場合はこれらをインスタンスの環境編集に登録してください。認証情報になりますので、公開リポジトリには含めないように注意してください。
なおHerokuのインスタンスに環境変数としてFIREBASE_ADMINSDK_private_keyをセットする時は\nを実際の改行に置換してセットしてください。

### Appleのプッシュ通知

```
APPLE_APNS_AUTH_KEY = ""
APPLE_KEY_ID = ""
APPLE_TEAM_ID = ""
APPLE_IOS_APP_BUNDLE_ID = ""
APPLE_WATCHOS_APP_BUNDLE_ID = ""
```

node-apnで必要な情報です。各自の開発環境から設定してください。

### その他

```
API_KEY = ""
```

Web APIのアクセスに必要なキーです。実際の環境では乱数でキーを生成して設定しています。

