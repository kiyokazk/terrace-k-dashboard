#!/bin/bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <agentId> <task text>" >&2
  exit 1
fi

AGENT_ID="$1"
shift
TASK_TEXT="$*"
TARGET="$HOME/.openclaw/agents/${AGENT_ID}/current-task.json"
mkdir -p "$(dirname "$TARGET")"

if [ -f "$TARGET" ]; then
  EXISTING_JSON=$(cat "$TARGET")
else
  EXISTING_JSON='{}'
fi

python3 - "$TARGET" "$TASK_TEXT" "$EXISTING_JSON" <<'PY'
import json, sys, time
path = sys.argv[1]
new_task = sys.argv[2].strip()
existing_raw = sys.argv[3]
try:
    existing = json.loads(existing_raw)
except Exception:
    existing = {}
old_tasks = existing.get('tasks', []) if isinstance(existing.get('tasks', []), list) else []
old_tasks = [str(x).strip() for x in old_tasks if str(x).strip()]
next_tasks = (old_tasks[-2:] + [new_task])[-3:]
payload = {
    'tasks': next_tasks,
    'updatedAt': int(time.time() * 1000),
}
with open(path, 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(json.dumps(payload, ensure_ascii=False))
PY
