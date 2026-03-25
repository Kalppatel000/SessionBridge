export {};
interface DomainConfig {
  csrfSelectors: string[];
  csrfHeader: string;
  refreshInterval: number;
  sessionTTL: number;
}

interface SessionBridgeConfig {
  domains: Record<string, DomainConfig>;
}

let refreshTimer: ReturnType<typeof setInterval> | null = null;

function matchDomain(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix) || hostname === pattern.slice(2);
  }
  return hostname === pattern;
}

function findMatchingConfig(hostname: string, config: SessionBridgeConfig): { pattern: string; domainConfig: DomainConfig } | null {
  for (const [pattern, domainConfig] of Object.entries(config.domains)) {
    if (matchDomain(hostname, pattern)) {
      return { pattern, domainConfig };
    }
  }
  return null;
}

function extractCsrfToken(selectors: string[]): string | null {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (!el) continue;

      // Check data-csrf-token attribute
      const dataToken = el.getAttribute('data-csrf-token');
      if (dataToken) return dataToken;

      // Check content attribute (meta tags)
      const content = el.getAttribute('content');
      if (content) return content;

      // Check value attribute (input fields)
      const value = el.getAttribute('value');
      if (value) return value;

      // Check innerText as last resort
      if (el.textContent?.trim()) return el.textContent.trim();
    } catch {
      // Selector parsing error — skip
    }
  }

  // Try well-known global variables (ServiceNow g_ck, etc.)
  try {
    const gCk = (window as unknown as Record<string, unknown>)['g_ck'];
    if (typeof gCk === 'string' && gCk.length > 0) return gCk;
  } catch {
    // Not available
  }

  return null;
}

function detectUser(): { detected: boolean; displayName?: string; identifier?: string } {
  // Try common patterns for detecting the logged-in user
  const selectors = [
    { sel: "meta[name='user-login']", attr: 'content' },
    { sel: "meta[name='username']", attr: 'content' },
    { sel: "meta[name='ajs-remote-user']", attr: 'content' },
    { sel: '[data-username]', attr: 'data-username' },
    { sel: '[data-user-login]', attr: 'data-user-login' },
  ];

  for (const { sel, attr } of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const value = el.getAttribute(attr);
        if (value) {
          return { detected: true, identifier: value };
        }
      }
    } catch {
      // skip
    }
  }

  // Try display name selectors
  const displayNameSelectors = [
    "meta[name='user-displayname']",
    '.user-name',
    '.username',
    '[data-display-name]',
  ];

  for (const sel of displayNameSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const displayName = el.getAttribute('data-display-name') || el.getAttribute('content') || el.textContent?.trim();
        if (displayName) {
          return { detected: true, displayName };
        }
      }
    } catch {
      // skip
    }
  }

  return { detected: false };
}

function captureAndSendSession(domainConfig: DomainConfig) {
  const hostname = window.location.hostname;

  const csrfToken = extractCsrfToken(domainConfig.csrfSelectors);
  const user = detectUser();

  const message = {
    type: 'WRITE_SESSION' as const,
    domain: hostname,
    csrf: csrfToken ? { token: csrfToken, header: domainConfig.csrfHeader } : undefined,
    user: user.detected ? user : undefined,
  };

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[SessionBridge] Failed to send session:', chrome.runtime.lastError.message);
      return;
    }
    if (response?.success) {
      console.log(`[SessionBridge] Session captured for ${hostname}`);
    } else {
      console.warn('[SessionBridge] Session write failed:', response?.error);
    }
  });
}

async function init() {
  const hostname = window.location.hostname;

  // Get config from background
  chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      return;
    }

    const config: SessionBridgeConfig = response.config;
    const match = findMatchingConfig(hostname, config);

    if (!match) return; // Domain not configured

    console.log(`[SessionBridge] Domain matched: ${hostname} → ${match.pattern}`);

    // Initial capture
    captureAndSendSession(match.domainConfig);

    // Set up periodic refresh
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      captureAndSendSession(match.domainConfig);
    }, match.domainConfig.refreshInterval * 1000);
  });
}

init();
