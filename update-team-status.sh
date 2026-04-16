#!/bin/bash
set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo "Usage: $0 <taskId> <owner> <status> <nextAction> <waitingFor>" >&2
  exit 1
fi

TASK_ID="$1"
OWNER="$2"
STATUS="$3"
NEXT_ACTION="$4"
WAITING_FOR="$5"
TARGET="$(cd "$(dirname "$0")" && pwd)/team-status.json"

python3 - "$TARGET" "$TASK_ID" "$OWNER" "$STATUS" "$NEXT_ACTION" "$WAITING_FOR" <<'PY'
import json, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

path = Path(sys.argv[1])
task_id, owner, status, next_action, waiting_for = sys.argv[2:7]
allowed_statuses = {"未着手", "進行中", "依頼待ち", "返答待ち", "完了", "問題発生"}
if status not in allowed_statuses:
    raise SystemExit(f"status must be one of: {', '.join(sorted(allowed_statuses))}")

jst = timezone(timedelta(hours=9))
now = datetime.now(jst).replace(microsecond=0).isoformat()

if path.exists():
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        data = {}
else:
    data = {}

items = data.get('items')
if not isinstance(items, list):
    items = []

existing = None
for item in items:
    if str(item.get('id', '')) == task_id:
        existing = item
        break

if existing is None:
    existing = {
        'id': task_id,
        'taskName': task_id,
    }
    items.append(existing)

existing['owner'] = owner
existing['status'] = status
existing['nextAction'] = next_action
existing['waitingFor'] = waiting_for
existing['updatedAt'] = now
existing['lastUpdated'] = now

payload = {
    'version': data.get('version', 1),
    'lastUpdated': now,
    'updatedAt': now,
    'items': items,
}

path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'ok': True, 'updatedId': task_id, 'updatedAt': now}, ensure_ascii=False))
PY
