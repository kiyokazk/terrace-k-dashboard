const fallbackDashboardData = {
  version: 'v1.4.1',
  lastUpdated: '未取得',
  agents: [
    { name: '澪', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得', recentTasks: ['—'], iconPath: '/characters/mio_icon02.png' },
    { name: 'ユイ', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得', recentTasks: ['—'], iconPath: '/characters/yui_icon02.png' },
    { name: 'ナナセ', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得', recentTasks: ['—'], iconPath: '/characters/nanase_icon01.png' },
    { name: 'レイン', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得', recentTasks: ['—'], iconPath: '/characters/rein_icon01.png' },
  ],
  teamStatus: {
    lastUpdated: '未取得',
    items: [],
  },
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
    version: data?.version ?? 'v1.4.1',
    lastUpdated: data?.lastUpdated ?? '未取得',
    agents: Array.isArray(data?.agents) && data.agents.length ? data.agents : fallbackDashboardData.agents,
    teamStatus: {
      lastUpdated: data?.teamStatus?.lastUpdated ?? '未取得',
      items: Array.isArray(data?.teamStatus?.items) ? data.teamStatus.items : [],
    },
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
        </div>
        <img class="agent-icon" src="${escapeHtml(agent.iconPath)}" alt="${escapeHtml(agent.name)} icon" />
      </div>
      <div class="agent-task-block">
        <p class="agent-task-label">現在のタスク</p>
        ${(agent.recentTasks ?? ['—']).map((t) => `<p class=\"agent-task-value\" title=\"${escapeHtml(t)}\">${escapeHtml(t)}</p>`).join('')}
      </div>
    </article>
  `).join('');
}

function renderTeamStatusRows(teamStatus) {
  if (!teamStatus.items.length) {
    return `<tr><td colspan="6"><span class="table-note">状態一覧はまだ手動登録されていません。</span></td></tr>`;
  }
  return teamStatus.items.map((item) => {
    const rowClasses = [
      item.status === '問題発生' ? 'team-status-row-critical' : '',
      item.isMissingNextAction ? 'team-status-row-missing-action' : '',
      item.isStale ? 'team-status-row-stale' : '',
    ].filter(Boolean).join(' ');
    return `
      <tr class="${rowClasses}">
        <td>
          <strong>${escapeHtml(item.taskName)}</strong>
          ${item.isStale ? '<div class="table-note table-note-warning">更新が古い可能性があります</div>' : ''}
        </td>
        <td>${escapeHtml(item.owner)}</td>
        <td><span class="status-badge ${statusClass(item.statusTone)}">${escapeHtml(item.status)}</span></td>
        <td>
          ${item.nextAction ? `<span class="team-next-action">${escapeHtml(item.nextAction)}</span>` : '<span class="table-note table-note-warning">次の一手が未設定です</span>'}
        </td>
        <td>${escapeHtml(item.waitingFor ?? '—')}</td>
        <td>${escapeHtml(item.updatedAt)}</td>
      </tr>
    `;
  }).join('');
}

function renderCronRows(cronJobs) {
  if (!cronJobs.length) return `<tr><td colspan="3"><span class="table-note">Cronジョブ情報を取得できませんでした。</span></td></tr>`;
  return cronJobs.map((job) => {
    const feedback = state.inlineJobFeedback[job.id];
    return `
      <tr>
        <td>
          <div class="cron-job-cell">
            <button class="run-button run-button-inline" data-job-id="${escapeHtml(job.id)}" ${state.runningJobId ? 'disabled' : ''}>${state.runningJobId === job.id ? '実行中...' : 'Run'}</button>
            <div>
              <strong>${escapeHtml(job.name)}</strong>
              <div class="table-note">agent: ${escapeHtml(job.agentId ?? '—')}</div>
              ${feedback ? `<div class="job-feedback ${feedback.tone === 'error' ? 'job-feedback-error' : ''}">${escapeHtml(feedback.text)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><span class="status-badge ${statusClass(job.statusTone)}">${escapeHtml(job.status)}</span></td>
        <td>${escapeHtml(job.lastRunAt)}</td>
      </tr>
    `;
  }).join('');
}

function renderToast() {
  return state.toastMessage ? `<div class="toast">${escapeHtml(state.toastMessage)}</div>` : '';
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
            <h2 class="section-title">Team Status</h2>
            <p class="section-description">止まりかけとボールの所在を拾うための共通一覧</p>
            <p class="team-status-help">この一覧は状態更新イベントで供給されます。更新が古い場合は、更新イベント未実行の可能性があります。</p>
          </div>
          <span class="table-note">一覧更新: ${escapeHtml(data.teamStatus.lastUpdated)}</span>
        </div>
        <div class="table-wrap">
          <table class="team-status-table">
            <thead>
              <tr>
                <th>タスク名</th>
                <th>担当者</th>
                <th>状態</th>
                <th>次の一手</th>
                <th>待ち先</th>
                <th>最終更新時刻</th>
              </tr>
            </thead>
            <tbody>${renderTeamStatusRows(data.teamStatus)}</tbody>
          </table>
        </div>
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
  autoRefreshTimer = window.setInterval(() => loadDashboardData(), 1_000);
}


render();
loadDashboardData();
startAutoRefresh();
