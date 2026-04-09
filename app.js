const fallbackDashboardData = {
  lastUpdated: '未取得',
  agents: [
    { name: '澪', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得' },
    { name: 'ユイ', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得' },
    { name: 'ナナセ', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得' },
    { name: 'レイン', status: 'offline', label: 'Offline', model: '—', checkedAt: '未取得', lastActive: '未取得' },
  ],
  cronJobs: [],
  gateway: {
    status: 'Unknown',
    tone: 'unknown',
    description: 'サーバーからの取得に失敗しました。',
    checkedAt: '未取得',
  },
};

const app = document.querySelector('#app');
let autoRefreshTimer = null;
let state = {
  data: structuredClone(fallbackDashboardData),
  selectedJob: null,
  isRunning: false,
  toastMessage: '',
  loading: true,
  loadError: '',
};

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
    if (showFeedback) {
      showToast('最新データを再取得しました');
    } else {
      render();
    }
  } catch {
    state.data = structuredClone(fallbackDashboardData);
    state.loading = false;
    state.loadError = 'サーバーからの状態取得に失敗したため、フォールバック表示に切り替えました。';
    if (showFeedback) {
      showToast('再取得に失敗しました');
    } else {
      render();
    }
  }
}

function renderAgents(agents) {
  return agents.map((agent) => `
    <article class="agent-card">
      <h3 class="agent-name">${agent.name}</h3>
      <span class="status-badge ${statusClass(agent.status)}">${agent.label}</span>
      <p class="agent-model">Model: ${agent.model ?? '—'}</p>
      <p class="agent-meta">Last active: ${agent.lastActive ?? '未取得'}</p>
      <p class="agent-meta">Last checked: ${agent.checkedAt ?? '未取得'}</p>
    </article>
  `).join('');
}

function renderCronRows(cronJobs) {
  if (!cronJobs.length) {
    return `<tr><td colspan="4"><span class="table-note">Cronジョブ情報を取得できませんでした。</span></td></tr>`;
  }

  return cronJobs.map((job) => `
    <tr>
      <td>
        <strong>${job.name}</strong>
        <div class="table-note">agent: ${job.agentId ?? '—'}</div>
      </td>
      <td><span class="status-badge ${statusClass(job.statusTone)}">${job.status}</span></td>
      <td>${job.lastRunAt}</td>
      <td>${job.runnable
        ? `<button class="run-button" data-job-name="${job.name}" ${state.isRunning ? 'disabled' : ''}>${state.isRunning && state.selectedJob === job.name ? '実行中...' : '実行'}</button>`
        : '<span class="table-note">未対応</span>'}
      </td>
    </tr>
  `).join('');
}

function renderDialog() {
  if (!state.selectedJob) return '';
  return `
    <div class="dialog-backdrop" id="confirm-dialog">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h3 id="dialog-title">Cronを実行しますか？</h3>
        <p>「${state.selectedJob}」を今すぐ実行します。よろしいですか？</p>
        <div class="dialog-actions">
          <button class="dialog-button" id="cancel-run">キャンセル</button>
          <button class="dialog-button primary" id="confirm-run" ${state.isRunning ? 'disabled' : ''}>実行する</button>
        </div>
      </div>
    </div>
  `;
}

function renderToast() {
  return state.toastMessage ? `<div class="toast">${state.toastMessage}</div>` : '';
}

function renderBanner() {
  if (state.loading) return '<div class="info-banner">読み込み中...</div>';
  if (state.loadError) return `<div class="info-banner info-banner-error">${state.loadError}</div>`;
  return '<div class="info-banner">サーバーからリアルタイム取得しています。30秒ごとに自動更新します。</div>';
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
          <div>
            <p class="meta-text">Last updated</p>
            <strong>${data.lastUpdated}</strong>
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
          <span class="table-note">runs/ の最終更新時刻を表示</span>
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
          <span class="status-badge ${statusClass(data.gateway.tone)}">${data.gateway.status}</span>
          <p class="gateway-description">${data.gateway.description}</p>
        </div>
        <p class="gateway-meta">Last checked: ${data.gateway.checkedAt}</p>
      </section>
    </main>
    ${renderDialog()}
    ${renderToast()}
  `;
  bindEvents();
}

function showToast(message) {
  state.toastMessage = message;
  render();
  window.setTimeout(() => {
    state.toastMessage = '';
    render();
  }, 2200);
}

function bindEvents() {
  document.querySelector('#refresh-button')?.addEventListener('click', () => {
    loadDashboardData({ showFeedback: true });
  });

  document.querySelectorAll('.run-button').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedJob = button.dataset.jobName;
      render();
    });
  });

  document.querySelector('#cancel-run')?.addEventListener('click', () => {
    state.selectedJob = null;
    render();
  });

  document.querySelector('#confirm-dialog')?.addEventListener('click', (event) => {
    if (event.target.id === 'confirm-dialog') {
      state.selectedJob = null;
      render();
    }
  });

  document.querySelector('#confirm-run')?.addEventListener('click', () => {
    if (!state.selectedJob) return;
    state.isRunning = true;
    render();
    window.setTimeout(() => {
      state.isRunning = false;
      const finishedJob = state.selectedJob;
      state.selectedJob = null;
      showToast(`「${finishedJob}」の手動実行UIは未接続です`);
    }, 500);
  });
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = window.setInterval(() => {
    loadDashboardData();
  }, 30_000);
}

render();
loadDashboardData();
startAutoRefresh();
