# Terrace.K Dashboard

Terrace.K チームの稼働状況をブラウザで確認するための軽量ダッシュボードです。

- Agents: 澪 / ユイ / ナナセ / レイン の状態とモデル
- Cron Jobs: OpenClaw cron の有効状態と最終実行時刻
- Gateway: OpenClaw Gateway の稼働状態

現在の構成では、静的 `data.json` ではなく Node.js の組み込み HTTP サーバーが `/api/status` で都度実データを取得し、ブラウザ側は 30 秒ごとに自動更新します。

## 起動方法

### 手動起動

```bash
cd ~/TerraceK/projects/terrace-k-dashboard
node server.js
```

起動後、以下でアクセスできます。

- ローカル: <http://127.0.0.1:3691/>
- 同一LAN内の別端末: `http://<このMacのLAN IP>:3691/`

## ローカルアクセスURL

- <http://127.0.0.1:3691/>

## LAN公開URLの確認方法

この Mac の LAN IP を確認して、その IP に `:3691` を付けて開きます。

```bash
/sbin/ipconfig getifaddr en0
```

必要に応じて `en1` も確認してください。

例:

```text
http://192.168.11.17:3691/
```

## LaunchAgent

macOS 起動時に自動でダッシュボードサーバーを立ち上げるため、以下の LaunchAgent を用意しています。

- plist: `~/Library/LaunchAgents/com.terraceK.dashboard.plist`
- 実行対象: `/usr/local/bin/node /Users/kiyokazk/TerraceK/projects/terrace-k-dashboard/server.js`
- ログ: `~/TerraceK/projects/terrace-k-dashboard/dashboard.log`

必要なら手動でロードできます。

```bash
launchctl load ~/Library/LaunchAgents/com.terraceK.dashboard.plist
```

再読み込みする場合:

```bash
launchctl unload ~/Library/LaunchAgents/com.terraceK.dashboard.plist
launchctl load ~/Library/LaunchAgents/com.terraceK.dashboard.plist
```

## API

### `GET /api/status`

OpenClaw の現在状態をリアルタイム取得して JSON を返します。

取得対象:
- agent セッションファイルから online / offline と model
- `team-status.json` からチーム共通タスク状態一覧
- cron `jobs.json` と `runs/` からジョブ状態と最終実行時刻
- Gateway `/health` から稼働状態

## team-status.json

チーム共通の状態一覧は `team-status.json` で管理します。初期状態は手動更新前提でしたが、最小実装として `update-team-status.sh` で状態更新イベントから upsert できるようにします。

```json
{
  "version": 1,
  "lastUpdated": "2026-04-14T15:00:00+09:00",
  "items": [
    {
      "id": "dashboard-team-status-v1",
      "taskName": "ダッシュボード改善と状態一覧導入",
      "owner": "ユイ",
      "status": "進行中",
      "nextAction": "状態一覧JSONと最小ビューを実装する",
      "waitingFor": "自分待ち",
      "updatedAt": "2026-04-14T14:52:00+09:00"
    }
  ]
}
```

状態は以下の固定値を使います。
- 未着手
- 進行中
- 依頼待ち
- 返答待ち
- 完了
- 問題発生

最小項目:
- `id`
- `taskName`
- `owner`
- `status`
- `nextAction`
- `waitingFor`
- `updatedAt`
- `lastUpdated`

## 補足

- フロントエンドは `app.js` から `/api/status` を fetch しています
- 更新ボタンでも即時再取得できます
- Cron の手動実行 UI は初期版では未接続です
- `dashboard.log` と `data.json` は生成物のため Git 管理対象外です

## update-team-status.sh

`team-status.json` の item を upsert するヘルパーです。

```bash
~/TerraceK/projects/terrace-k-dashboard/update-team-status.sh dashboard-flow-test ユイ 進行中 "更新フロー実装を進める" "自分待ち"
```

引数:
- `taskId`
- `owner`
- `status`（固定値: `未着手` / `進行中` / `依頼待ち` / `返答待ち` / `完了` / `問題発生`）
- `nextAction`
- `waitingFor`

着手、依頼送信前後、問題発生、完了報告前後などの状態更新イベントから呼ぶ前提です。

### 接続ガイド

このリポジトリ内には、Slack へ `【着手】` や `【実装依頼】` などを送信する実体処理は含まれていません。
そのため、ここでは `update-team-status.sh` をどの局面でどう呼ぶかの使用例と引数対応表までを残します。

#### 4起点ごとの引数対応表

| 起点 | status | waitingFor | nextAction の考え方 |
|---|---|---|---|
| 【着手】送信直後 | `進行中` | `自分待ち` など | 直近で進める実作業を書く |
| 【実装依頼】【デザイン依頼】送信直後 | `返答待ち` | 依頼先の名前 | 相手からの返答待ちであることを書く |
| 【問題発生】送信直後 | `問題発生` | 相談先または `判断待ち` | 何の判断や解消が必要かを書く |
| 【完了報告】【実装完了】【デザイン完了】送信直後 | `完了` | `—` | 次に発生時の保守・追跡方針を書く |

#### サンプル呼び出し集

```bash
# 1. 着手
~/TerraceK/projects/terrace-k-dashboard/update-team-status.sh dashboard-task ユイ 進行中 "実装を開始する" "自分待ち"

# 2. 実装依頼 / デザイン依頼の送信直後
~/TerraceK/projects/terrace-k-dashboard/update-team-status.sh dashboard-task 澪 返答待ち "ユイからの返答を待つ" "ユイ待ち"

# 3. 問題発生
~/TerraceK/projects/terrace-k-dashboard/update-team-status.sh dashboard-task ユイ 問題発生 "仕様判断を確認する" "澪待ち"

# 4. 完了報告 / 実装完了 / デザイン完了の送信直後
~/TerraceK/projects/terrace-k-dashboard/update-team-status.sh dashboard-task ユイ 完了 "追加修正が出たら都度対応する" "—"
```

#### 次に接続すべき側

今後このスクリプトを実際に接続する先は、Slack 送信を担う側です。具体的には
- `【着手】`
- `【実装依頼】【デザイン依頼】`
- `【問題発生】`
- `【完了報告】【実装完了】【デザイン完了】`
を送る実体スクリプトまたは別リポジトリ側で、送信直後にこのスクリプトを呼ぶ想定です。

## update-task.sh

直近3件のタスク履歴を書き込むヘルパーです。

```bash
~/TerraceK/projects/terrace-k-dashboard/update-task.sh yui "SPEC.mdを調査中"
~/TerraceK/projects/terrace-k-dashboard/update-task.sh yui "完了"
~/TerraceK/projects/terrace-k-dashboard/update-task.sh yui "待機中"
```

`~/.openclaw/agents/{agentId}/current-task.json` に以下形式で保存されます。

```json
{"tasks":["2つ前","1つ前","最新"],"updatedAt":1775710000000}
```
