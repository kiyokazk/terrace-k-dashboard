#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const AGENTS = [
  { id: 'main', name: '澪' },
  { id: 'yui', name: 'ユイ' },
  { id: 'nanase', name: 'ナナセ' },
  { id: 'rein', name: 'レイン' },
];

const AGENTS_ROOT = '/Users/kiyokazk/.openclaw/agents';
const CRON_JOBS_FILE = '/Users/kiyokazk/.openclaw/cron/jobs.json';
const CRON_RUNS_DIR = '/Users/kiyokazk/.openclaw/cron/runs';
const GATEWAY_HEALTH_URL = 'http://127.0.0.1:18789/health';
const ONLINE_WINDOW_MS = 5 * 60 * 1000;

function formatJst(dateLike) {
  if (!dateLike) return '未取得';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '未取得';

  const formatter = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  });

  return `${formatter.format(date).replaceAll('/', '-')} JST`;
}

function safeReadDir(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
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
          if (typeof candidate === 'string' && candidate.trim()) {
            latestModel = candidate.trim();
          }
        }
      } catch {}
    }

    return latestModel ?? '—';
  } catch {
    return '取得不可';
  }
}

function getAgentData(agent) {
  const latest = findLatestSessionFile(agent.id);
  if (!latest) {
    return {
      name: agent.name,
      agentId: agent.id,
      status: 'offline',
      label: 'Offline',
      model: '取得不可',
      checkedAt: formatJst(Date.now()),
      lastActive: '未取得',
    };
  }

  const now = Date.now();
  const isOnline = now - latest.mtimeMs <= ONLINE_WINDOW_MS;

  return {
    name: agent.name,
    agentId: agent.id,
    status: isOnline ? 'online' : 'offline',
    label: isOnline ? 'Online' : 'Offline',
    model: extractModelFromJsonl(latest.fullPath),
    checkedAt: formatJst(now),
    lastActive: formatJst(latest.mtimeMs),
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
      runnable: false,
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
      ? {
          status: 'Running',
          tone: 'online',
          description: 'Gateway health endpoint が live を返しています。',
          checkedAt: formatJst(Date.now()),
        }
      : {
          status: 'Error',
          tone: 'error',
          description: 'Gateway health endpoint は応答しましたが、期待する live 状態ではありません。',
          checkedAt: formatJst(Date.now()),
        };
  } catch {
    return {
      status: 'Error',
      tone: 'error',
      description: 'Gateway health endpoint に到達できませんでした。',
      checkedAt: formatJst(Date.now()),
    };
  }
}

async function collectStatus() {
  const generatedAt = Date.now();
  return {
    lastUpdated: formatJst(generatedAt),
    generatedAtMs: generatedAt,
    agents: AGENTS.map(getAgentData),
    cronJobs: getCronJobs(),
    gateway: await getGatewayStatus(),
  };
}

module.exports = {
  collectStatus,
  formatJst,
};

if (require.main === module) {
  collectStatus()
    .then((data) => {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
