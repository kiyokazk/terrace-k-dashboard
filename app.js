const fallbackDashboardData = {
  version: 'v1.2.0',
  lastUpdated: '未取得',
  agents: [
    { name: '澪', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得', currentTask: '—', iconPath: '/characters/mio_icon02.png' },
    { name: 'ユイ', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得', currentTask: '—', iconPath: '/characters/yui_icon02.png' },
    { name: 'ナナセ', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得', currentTask: '—', iconPath: '/characters/nanase_icon01.png' },
    { name: 'レイン', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得', currentTask: '—', iconPath: '/characters/rein_icon01.png' },
  ],
  cronJobs: [],
  gateway: {
    status: 'Unknown', tone: 'unknown', description: 'サーバーからの取得に失敗しました。', checkedAt: '未取得',
  },
};

const app = document.querySelector('#app');
let autoRefreshTimer = null;
let state = {
  data: structuredClone(fallbackDashboardData),
  selectedJob: null,
  runningJobId: null,
  toastMessage: '',
  loading: true,
  loadError: '',
  inlineJobFeedback: {},
};

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function statusClass(tone) {
  switch (tone) {
    case 'online': return 'status-online';
    case 'warning': return 'status-warning';
    case 'error': return 'status-error';
    case 'stopped': return 'status-stopped';
    default: return 'status-unknown';
  }
}

function normalizeData(data) {
  return {
    version: data?.version ?? 'v1.2.0',
    lastUpdated: data?.lastUpdated ?? '未取得',
    agents: Array.isArray(data?.agents) && data.agents.length ? data.agents : fallbackDashboardData.agents,
    cronJobs: Array.isArray(data?.cronJobs) ? data.cronJobs : [],
    gateway: data?.gateway ?? fallbackDashboardData.gateway,
  };
}

async function loadDashboardData({ showFeedback = false } = {}) {
  state.loading = true;
  state.loadError = '';
  render();
  try {
    const response = await fetch(`/api/status?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.data = normalizeData(data);
    state.loading = false;
    if (showFeedback) showToast('最新データを再取得しました');
    else render();
  } catch {
    state.data = structuredClone(fallbackDashboardData);
    state.loading = false;
    state.loadError = 'サーバーからの状態取得に失敗したため、フォールバック表示に切り替えました。';
    if (showFeedback) showToast('再取得に失敗しました');
    else render();
  }
}

async function runCronJob(jobId) {
  state.runningJobId = jobId;
  state.inlineJobFeedback[jobId] = { tone: 'warning', text: '実行中...' };
  render();
  try {
    const response = await fetch('/api/cron/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || '実行に失敗しました');
    state.inlineJobFeedback[jobId] = { tone: 'online', text: '実行を開始しました' };
    state.runningJobId = null;
    render();
    setTimeout(() => {
      delete state.inlineJobFeedback[jobId];
      loadDashboardData({ showFeedback: true });
    }, 1500);
  } catch (error) {
    state.inlineJobFeedback[jobId] = { tone: 'error', text: '実行に失敗しました' };
    state.runningJobId = null;
    render();
    setTimeout(() => {
      delete state.inlineJobFeedback[jobId];
      render();
    }, 2500);
  }
}

function renderAgents(agents) {
  return agents.map((agent) => `
    <article class="agent-card">
      <div class="agent-header-row">
        <div class="agent-copy">
          <h3 class="agent-name">${escapeHtml(agent.name)}</h3>
          <span class="status-badge ${statusClass(agent.status)}">${escapeHtml(agent.label)}</span>
          <p class="agent-model">Model: ${escapeHtml(agent.model ?? '—')}</p>
          <p class="agent-meta">Last active: ${escapeHtml(agent.lastActive ?? '未取得')}</p>
          <p class="agent-meta">Last checked: ${escapeHtml(agent.checkedAt ?? '未取得')}</p>
        </div>
        <img class="agent-icon" src="${escapeHtml(agent.iconPath)}" alt="${escapeHtml(agent.name)} icon" />
      </div>
      <div class="agent-task-block">
        <p class="agent-task-label">現在のタスク</p>
        <p class="agent-task-value" title="${escapeHtml(agent.currentTask ?? '—')}">${escapeHtml(agent.currentTask ?? '—')}</p>
      </div>
    </article>
  `).join('');
}

function renderCronRows(cronJobs) {
  if (!cronJobs.length) return `<tr><td colspan="4"><span class="table-note">Cronジョブ情報を取得できませんでした。</span></td></tr>`;
  return cronJobs.map((job) => {
    const feedback = state.inlineJobFeedback[job.id];
    return `
      <tr>
        <td>
          <strong>${escapeHtml(job.name)}</strong>
          <div class="table-note">agent: ${escapeHtml(job.agentId ?? '—')}</div>
          ${feedback ? `<div class="job-feedback ${feedback.tone === 'error' ? 'job-feedback-error' : ''}">${escapeHtml(feedback.text)}</div>` : ''}
        </td>
        <td><span class="status-badge ${statusClass(job.statusTone)}">${escapeHtml(job.status)}</span></td>
        <td>${escapeHtml(job.lastRunAt)}</td>
        <td>
          <button class="run-button" data-job-id="${escapeHtml(job.id)}" ${state.runningJobId ? 'disabled' : ''}>${state.runningJobId === job.id ? '実行中...' : 'Run'}</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderToast() {
  return state.toastMessage ? `<div class="toast">${escapeHtml(state.toastMessage)}</div>` : '';
}

function renderBanner() {
  if (state.loading) return '<div class="info-banner">読み込み中...</div>';
  if (state.loadError) return `<div class="info-banner info-banner-error">${escapeHtml(state.loadError)}</div>`;
  return '<div class="info-banner">サーバーからリアルタイム取得しています。1秒ごとに自動更新します。</div>';
}

function render() {
  const { data } = state;
  app.innerHTML = `
    <main class="app">
      <header class="page-header">
        <div>
          <p class="meta-text">Operations Dashboard</p>
          <h1 class="page-title">Terrace.K Dashboard</h1>
          <p class="page-subtitle">チーム稼働状況の一覧</p>
        </div>
        <div class="header-actions">
          <div class="version-label">${escapeHtml(data.version ?? 'v1.2.0')}</div>
          <div>
            <p class="meta-text">Last updated</p>
            <strong>${escapeHtml(data.lastUpdated)}</strong>
          </div>
          <button class="refresh-button" id="refresh-button" ${state.loading ? 'disabled' : ''}>更新</button>
        </div>
      </header>

      ${renderBanner()}

      <section class="section-card">
        <div class="section-heading">
          <div>
            <h2 class="section-title">Agents</h2>
            <p class="section-description">現在の接続状態と利用モデル</p>
          </div>
        </div>
        <div class="agent-grid">${renderAgents(data.agents)}</div>
      </section>

      <section class="section-card">
        <div class="section-heading">
          <div>
            <h2 class="section-title">Cron Jobs</h2>
            <p class="section-description">定期実行タスクの状態一覧</p>
          </div>
          <span class="table-note">Run ボタンで即時実行できます</span>
        </div>
        <div class="table-wrap">
          <table class="cron-table">
            <thead>
              <tr>
                <th>ジョブ名</th>
                <th>状態</th>
                <th>最終実行時刻</th>
                <th>アクション</th>
              </tr>
            </thead>
            <tbody>${renderCronRows(data.cronJobs)}</tbody>
          </table>
        </div>
      </section>

      <section class="gateway-card">
        <div class="section-heading">
          <div>
            <h2 class="section-title">Gateway</h2>
            <p class="section-description">接続基盤の現在状態</p>
          </div>
        </div>
        <div class="gateway-status-row">
          <span class="status-badge ${statusClass(data.gateway.tone)}">${escapeHtml(data.gateway.status)}</span>
          <p class="gateway-description">${escapeHtml(data.gateway.description)}</p>
        </div>
        <p class="gateway-meta">Last checked: ${escapeHtml(data.gateway.checkedAt)}</p>
      </section>
    </main>
    ${renderToast()}
  `;
  bindEvents();
}

function showToast(message) {
  state.toastMessage = message;
  render();
  window.setTimeout(() => { state.toastMessage = ''; render(); }, 2200);
}

function bindEvents() {
  document.querySelector('#refresh-button')?.addEventListener('click', () => loadDashboardData({ showFeedback: true }));
  document.querySelectorAll('.run-button').forEach((button) => {
    button.addEventListener('click', () => runCronJob(button.dataset.jobId));
  });
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = window.setInterval(() => loadDashboardData(), 30_000);
}

render();
loadDashboardData();
startAutoRefresh();
