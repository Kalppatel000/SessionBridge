interface DomainConfig {
  csrfSelectors: string[];
  csrfHeader: string;
  refreshInterval: number;
  sessionTTL: number;
}

interface SessionBridgeConfig {
  domains: Record<string, DomainConfig>;
}

interface DomainStatus {
  configured: boolean;
  lastRefresh: number | null;
  user?: { detected: boolean; displayName?: string; identifier?: string };
}

const domainsList = document.getElementById('domains-list')!;
const addDomainBtn = document.getElementById('add-domain-btn')!;
const refreshAllBtn = document.getElementById('refresh-all-btn')!;
const addDomainForm = document.getElementById('add-domain-form')!;
const saveDomainBtn = document.getElementById('save-domain-btn')!;
const cancelDomainBtn = document.getElementById('cancel-domain-btn')!;

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getStatusClass(lastRefresh: number | null, ttl: number): string {
  if (!lastRefresh) return 'status-none';
  const age = (Date.now() - lastRefresh) / 1000;
  if (age < ttl) return 'status-active';
  return 'status-stale';
}

function getStatusLabel(lastRefresh: number | null, ttl: number): string {
  if (!lastRefresh) return 'No session';
  const age = (Date.now() - lastRefresh) / 1000;
  if (age < ttl) return 'Active';
  return 'Stale';
}

function renderDomains(config: SessionBridgeConfig, status: Record<string, DomainStatus>) {
  domainsList.innerHTML = '';

  const patterns = Object.keys(config.domains);
  if (patterns.length === 0) {
    domainsList.innerHTML = '<p style="color:#666;font-size:12px;text-align:center;padding:20px 0;">No domains configured. Click "Add Domain" to get started.</p>';
    return;
  }

  for (const pattern of patterns) {
    const domainConfig = config.domains[pattern];
    const domainStatus = status[pattern];
    const lastRefresh = domainStatus?.lastRefresh;

    const statusClass = getStatusClass(lastRefresh, domainConfig.sessionTTL);
    const statusLabel = getStatusLabel(lastRefresh, domainConfig.sessionTTL);

    const card = document.createElement('div');
    card.className = 'domain-card';

    let infoText = `CSRF: ${domainConfig.csrfHeader}`;
    if (lastRefresh) {
      infoText += ` · Last refresh: ${timeAgo(lastRefresh)}`;
    }
    if (domainStatus?.user?.detected) {
      const userName = domainStatus.user.displayName || domainStatus.user.identifier || 'Unknown';
      infoText += ` · ${userName}`;
    }

    card.innerHTML = `
      <div class="domain-header">
        <span class="domain-name">${pattern}</span>
        <span class="domain-status ${statusClass}">${statusLabel}</span>
      </div>
      <div class="domain-info">${infoText}</div>
      <div class="domain-actions">
        <button class="btn-remove" data-pattern="${pattern}">Remove</button>
      </div>
    `;

    domainsList.appendChild(card);
  }

  // Bind remove buttons
  document.querySelectorAll('.btn-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pattern = (btn as HTMLElement).dataset.pattern!;
      removeDomain(pattern);
    });
  });
}

async function loadStatus() {
  return new Promise<{ config: SessionBridgeConfig; status: Record<string, DomainStatus> }>((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (configResp) => {
      const config: SessionBridgeConfig = configResp?.config || { domains: {} };
      chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (statusResp) => {
        resolve({ config, status: statusResp?.domains || {} });
      });
    });
  });
}

async function refresh() {
  const { config, status } = await loadStatus();
  renderDomains(config, status);
}

async function removeDomain(pattern: string) {
  const { config } = await loadStatus();
  delete config.domains[pattern];
  chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config }, () => {
    refresh();
  });
}

function showAddForm() {
  addDomainForm.classList.remove('hidden');
  addDomainBtn.classList.add('hidden');
}

function hideAddForm() {
  addDomainForm.classList.add('hidden');
  addDomainBtn.classList.remove('hidden');
  // Clear inputs
  (document.getElementById('domain-pattern') as HTMLInputElement).value = '';
  (document.getElementById('csrf-selector') as HTMLInputElement).value = '';
  (document.getElementById('csrf-header') as HTMLInputElement).value = 'X-CSRF-Token';
  (document.getElementById('refresh-interval') as HTMLInputElement).value = '600';
  (document.getElementById('session-ttl') as HTMLInputElement).value = '3600';
}

async function saveDomain() {
  const pattern = (document.getElementById('domain-pattern') as HTMLInputElement).value.trim();
  const csrfSelector = (document.getElementById('csrf-selector') as HTMLInputElement).value.trim();
  const csrfHeader = (document.getElementById('csrf-header') as HTMLInputElement).value.trim();
  const refreshInterval = parseInt((document.getElementById('refresh-interval') as HTMLInputElement).value, 10);
  const sessionTTL = parseInt((document.getElementById('session-ttl') as HTMLInputElement).value, 10);

  if (!pattern) return;

  const { config } = await loadStatus();
  config.domains[pattern] = {
    csrfSelectors: csrfSelector ? [csrfSelector] : [],
    csrfHeader: csrfHeader || 'X-CSRF-Token',
    refreshInterval: refreshInterval || 600,
    sessionTTL: sessionTTL || 3600,
  };

  chrome.runtime.sendMessage({ type: 'UPDATE_CONFIG', config }, () => {
    hideAddForm();
    refresh();
  });
}

// Event listeners
addDomainBtn.addEventListener('click', showAddForm);
cancelDomainBtn.addEventListener('click', hideAddForm);
saveDomainBtn.addEventListener('click', saveDomain);
refreshAllBtn.addEventListener('click', () => {
  // Trigger a refresh by reloading active tabs for configured domains
  refresh();
});

// Initial load
refresh();
