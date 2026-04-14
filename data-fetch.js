#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const AGENTS = [
  { id: 'main', name: '澪', iconPath: '/characters/mio_icon02.png' },
  { id: 'yui', name: 'ユイ', iconPath: '/characters/yui_icon02.png' },
  { id: 'nanase', name: 'ナナセ', iconPath: '/characters/nanase_icon01.png' },
  { id: 'rein', name: 'レイン', iconPath: '/characters/rein_icon01.png' },
];

const AGENTS_ROOT = '/Users/kiyokazk/.openclaw/agents';
const CRON_JOBS_FILE = '/Users/kiyokazk/.openclaw/cron/jobs.json';
const CRON_RUNS_DIR = '/Users/kiyokazk/.openclaw/cron/runs';
const GATEWAY_HEALTH_URL = 'http://127.0.0.1:18789/health';
const TEAM_STATUS_FILE = '/Users/kiyokazk/TerraceK/projects/terrace-k-dashboard/team-status.json';
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const CURRENT_TASK_WINDOW_MS = 60 * 60 * 1000;
const STALE_TEAM_STATUS_MS = 6 * 60 * 60 * 1000;

function formatJst(dateLike) {
  if (!dateLike) return '未取得';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '未取得';
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Tokyo',
  });
  return `${formatter.format(date).replaceAll('/', '-')} JST`;
}

function safeReadDir(dirPath) {
  try { return fs.readdirSync(dirPath, { withFileTypes: true }); } catch { return []; }
}

function findLatestSessionFile(agentId) {
  const sessionsDir = path.join(AGENTS_ROOT, agentId, 'sessions');
  const files = safeReadDir(sessionsDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl') && !entry.name.includes('.reset.') && !entry.name.includes('.deleted.'))
    .map((entry) => {
      const fullPath = path.join(sessionsDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0] ?? null;
}

function extractModelFromJsonl(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    let latestModel = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const candidates = [parsed?.model, parsed?.message?.model, parsed?.payload?.model, parsed?.data?.model];
        for (const candidate of candidates) {
          if (typeof candidate === 'string' && candidate.trim()) latestModel = candidate.trim();
        }
      } catch {}
    }
    return latestModel ?? '—';
  } catch {
    return '取得不可';
  }
}

function extractRecentTasksFromTaskFile(agentId) {
  const taskFile = path.join(AGENTS_ROOT, agentId, 'current-task.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
    const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean) : [];
    const updatedAt = Number(parsed?.updatedAt);
    if (!tasks.length || !Number.isFinite(updatedAt)) return null;
    if (Date.now() - updatedAt > CURRENT_TASK_WINDOW_MS) return null;
    return tasks.slice(-3);
  } catch {
    return null;
  }
}

function extractCurrentTaskFromJsonl(filePath) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        const message = parsed?.message;
        if (message?.role !== 'assistant') continue;
        const content = Array.isArray(message.content) ? message.content : [];
        const textParts = content.filter((item) => item?.type === 'text' && typeof item.text === 'string').map((item) => item.text.trim()).filter(Boolean);
        const raw = textParts.join(' ').replace(/\s+/g, ' ').trim();
        const isSystemText = /^NO_REPLY$/.test(raw) || /^\[\[.*?\]\]/.test(raw) || raw.length === 0;
        if (isSystemText) continue;
        return raw.slice(0, 50);
      } catch {}
    }
    return '—';
  } catch {
    return '—';
  }
}

function resolveRecentTasks(agentId, latestSessionPath) {
  const fromTaskFile = extractRecentTasksFromTaskFile(agentId);
  if (fromTaskFile) return fromTaskFile;
  if (!latestSessionPath) return ['—'];
  return [extractCurrentTaskFromJsonl(latestSessionPath)];
}

function getAgentData(agent) {
  const latest = findLatestSessionFile(agent.id);
  const checkedAt = formatJst(Date.now());
  if (!latest) {
    return {
      name: agent.name,
      agentId: agent.id,
      iconPath: agent.iconPath,
      status: 'offline',
      label: 'Offline',
      model: '取得不可',
      checkedAt,
      lastActive: '未取得',
      recentTasks: resolveRecentTasks(agent.id, null),
    };
  }
  const now = Date.now();
  const isOnline = now - latest.mtimeMs <= ONLINE_WINDOW_MS;
  return {
    name: agent.name,
    agentId: agent.id,
    iconPath: agent.iconPath,
    status: isOnline ? 'online' : 'offline',
    label: isOnline ? 'Online' : 'Offline',
    model: extractModelFromJsonl(latest.fullPath),
    checkedAt,
    lastActive: formatJst(latest.mtimeMs),
    recentTasks: resolveRecentTasks(agent.id, latest.fullPath),
  };
}

function getCronJobs() {
  let jobs = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(CRON_JOBS_FILE, 'utf8'));
    jobs = Array.isArray(parsed.jobs) ? parsed.jobs : [];
  } catch {}
  return jobs.map((job) => {
    const runFile = path.join(CRON_RUNS_DIR, `${job.id}.jsonl`);
    let lastRunAt = '未取得';
    try {
      const stat = fs.statSync(runFile);
      lastRunAt = formatJst(stat.mtimeMs);
    } catch {}
    return {
      id: job.id,
      name: job.name ?? job.id,
      enabled: Boolean(job.enabled),
      status: job.enabled ? 'Enabled' : 'Disabled',
      statusTone: job.enabled ? 'online' : 'unknown',
      lastRunAt,
      runnable: true,
      agentId: job.agentId ?? '—',
    };
  });
}

async function getGatewayStatus() {
  try {
    const response = await fetch(GATEWAY_HEALTH_URL, { method: 'GET' });
    const json = await response.json();
    const ok = response.ok && json?.ok === true && json?.status === 'live';
    return ok
      ? { status: 'Running', tone: 'online', description: 'Gateway health endpoint が live を返しています。', checkedAt: formatJst(Date.now()) }
      : { status: 'Error', tone: 'error', description: 'Gateway health endpoint は応答しましたが、期待する live 状態ではありません。', checkedAt: formatJst(Date.now()) };
  } catch {
    return { status: 'Error', tone: 'error', description: 'Gateway health endpoint に到達できませんでした。', checkedAt: formatJst(Date.now()) };
  }
}

function parseIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTeamStatusTone(item, now = Date.now()) {
  if (item.status === '問題発生') return 'error';
  if (item.status === '依頼待ち' || item.status === '返答待ち') return 'warning';
  if (item.status === '完了') return 'online';
  const updatedAt = parseIsoDate(item.updatedAt);
  if (!updatedAt) return 'warning';
  return now - updatedAt.getTime() > STALE_TEAM_STATUS_MS ? 'warning' : 'unknown';
}

function getTeamStatusMeta(item, now = Date.now()) {
  const hasNextAction = typeof item.nextAction === 'string' && item.nextAction.trim().length > 0;
  const updatedAt = parseIsoDate(item.updatedAt);
  return {
    isMissingNextAction: !hasNextAction,
    isStale: !updatedAt || now - updatedAt.getTime() > STALE_TEAM_STATUS_MS,
  };
}

function getTeamStatuses() {
  try {
    const parsed = JSON.parse(fs.readFileSync(TEAM_STATUS_FILE, 'utf8'));
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const now = Date.now();
    return {
      lastUpdated: formatJst(parsed?.lastUpdated ?? now),
      items: items.map((item) => {
        const meta = getTeamStatusMeta(item, now);
        return {
          id: item.id ?? `${item.owner ?? 'unknown'}-${item.taskName ?? 'task'}`,
          taskName: item.taskName ?? '名称未設定',
          owner: item.owner ?? '未設定',
          status: item.status ?? '未着手',
          nextAction: item.nextAction ?? '',
          waitingFor: item.waitingFor ?? '—',
          updatedAt: formatJst(item.updatedAt),
          statusTone: getTeamStatusTone(item, now),
          isMissingNextAction: meta.isMissingNextAction,
          isStale: meta.isStale,
        };
      }),
    };
  } catch {
    return {
      lastUpdated: '未取得',
      items: [],
    };
  }
}

async function collectStatus() {
  const generatedAt = Date.now();
  return {
    version: 'v1.4.0',
    lastUpdated: formatJst(generatedAt),
    generatedAtMs: generatedAt,
    agents: AGENTS.map(getAgentData),
    teamStatus: getTeamStatuses(),
    cronJobs: getCronJobs(),
    gateway: await getGatewayStatus(),
  };
}

module.exports = { collectStatus, formatJst };

if (require.main === module) {
  collectStatus().then((data) => {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
