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

チーム共通の状態一覧は `team-status.json` で手動管理します。

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
- `taskName`
- `owner`
- `status`
- `nextAction`
- `waitingFor`
- `updatedAt`

## 補足

- フロントエンドは `app.js` から `/api/status` を fetch しています
- 更新ボタンでも即時再取得できます
- Cron の手動実行 UI は初期版では未接続です
- `dashboard.log` と `data.json` は生成物のため Git 管理対象外です

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
