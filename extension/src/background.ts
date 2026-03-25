export {};
const NATIVE_HOST_NAME = 'com.sessionbridge.native';

interface DomainConfig {
  csrfSelectors: string[];
  csrfHeader: string;
  refreshInterval: number;
  sessionTTL: number;
}

interface SessionBridgeConfig {
  domains: Record<string, DomainConfig>;
}

interface WriteSessionMessage {
  type: 'WRITE_SESSION';
  domain: string;
  csrf?: { token: string; header: string };
  user?: { detected: boolean; displayName?: string; identifier?: string };
}

interface GetStatusMessage {
  type: 'GET_STATUS';
}

interface UpdateConfigMessage {
  type: 'UPDATE_CONFIG';
  config: SessionBridgeConfig;
}

interface GetConfigMessage {
  type: 'GET_CONFIG';
}

type ExtensionMessage = WriteSessionMessage | GetStatusMessage | UpdateConfigMessage | GetConfigMessage;

const DEFAULT_CONFIG: SessionBridgeConfig = {
  domains: {
    '*.service-now.com': {
      csrfSelectors: ["input[name='sysparm_ck']", "#sn-composer-bridge[data-csrf-token]"],
      csrfHeader: 'X-UserToken',
      refreshInterval: 600,
      sessionTTL: 1800,
    },
    '*.atlassian.net': {
      csrfSelectors: ["meta[name='ajs-atl-token']"],
      csrfHeader: 'X-Atlassian-Token',
      refreshInterval: 600,
      sessionTTL: 3600,
    },
    '*.salesforce.com': {
      csrfSelectors: ["meta[name='csrf-token']"],
      csrfHeader: 'X-SFDC-Session',
      refreshInterval: 600,
      sessionTTL: 3600,
    },
    'github.com': {
      csrfSelectors: ["meta[name='csrf-token']"],
      csrfHeader: 'X-CSRF-Token',
      refreshInterval: 600,
      sessionTTL: 3600,
    },
  },
};

// Session status tracking (in-memory)
const sessionStatus: Record<string, { timestamp: number; domain: string; user?: { detected: boolean; displayName?: string; identifier?: string } }> = {};

async function getConfig(): Promise<SessionBridgeConfig> {
  const result = await chrome.storage.local.get('config');
  return result.config || DEFAULT_CONFIG;
}

async function saveConfig(config: SessionBridgeConfig): Promise<void> {
  await chrome.storage.local.set({ config });
}

function matchDomain(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // e.g., ".service-now.com"
    return hostname.endsWith(suffix) || hostname === pattern.slice(2);
  }
  return hostname === pattern;
}

async function findDomainConfig(hostname: string): Promise<{ pattern: string; config: DomainConfig } | null> {
  const sbConfig = await getConfig();
  for (const [pattern, config] of Object.entries(sbConfig.domains)) {
    if (matchDomain(hostname, pattern)) {
      return { pattern, config };
    }
  }
  return null;
}

async function getCookiesForDomain(domain: string): Promise<string> {
  const cookies = await chrome.cookies.getAll({ domain });
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

function sendToNativeHost(message: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    console.log('[SessionBridge] Calling chrome.runtime.sendNativeMessage to host:', NATIVE_HOST_NAME);
    try {
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[SessionBridge] Native messaging error:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('[SessionBridge] Native messaging success, response:', response);
          resolve(response);
        }
      });
    } catch (e) {
      console.error('[SessionBridge] sendNativeMessage threw:', (e as Error).message);
      reject(e);
    }
  });
}

async function handleWriteSession(msg: WriteSessionMessage, sendResponse: (resp: unknown) => void) {
  try {
    console.log('[SessionBridge] handleWriteSession called for domain:', msg.domain);

    const cookieString = await getCookiesForDomain(msg.domain);
    console.log('[SessionBridge] Cookies retrieved, length:', cookieString.length);

    const sessionData = {
      domain: msg.domain,
      cookies: cookieString,
      csrf: msg.csrf || null,
      user: msg.user || null,
      timestamp: Date.now(),
      ttl: 1800, // default; overridden below
    };

    // Look up TTL from config
    const domainConfig = await findDomainConfig(msg.domain);
    if (domainConfig) {
      sessionData.ttl = domainConfig.config.sessionTTL;
    }
    console.log('[SessionBridge] Sending to native host, action: write_session, domain:', msg.domain);

    const nativeMessage = {
      action: 'write_session',
      ...sessionData,
    };
    console.log('[SessionBridge] Native message size:', JSON.stringify(nativeMessage).length, 'bytes');

    const nativeResponse = await sendToNativeHost(nativeMessage);
    console.log('[SessionBridge] Native host response:', JSON.stringify(nativeResponse));

    // Track status
    sessionStatus[msg.domain] = {
      timestamp: Date.now(),
      domain: msg.domain,
      user: msg.user,
    };

    sendResponse({ success: true });
  } catch (err) {
    console.error('[SessionBridge] Failed to write session:', (err as Error).message);
    console.error('[SessionBridge] Error stack:', (err as Error).stack);
    sendResponse({ success: false, error: (err as Error).message });
  }
}

async function handleGetStatus(sendResponse: (resp: unknown) => void) {
  const config = await getConfig();
  const domains: Record<string, { configured: boolean; lastRefresh: number | null; user?: { detected: boolean; displayName?: string; identifier?: string } }> = {};

  for (const pattern of Object.keys(config.domains)) {
    const status = Object.entries(sessionStatus).find(([domain]) => matchDomain(domain, pattern));
    domains[pattern] = {
      configured: true,
      lastRefresh: status ? status[1].timestamp : null,
      user: status ? status[1].user : undefined,
    };
  }

  sendResponse({ success: true, domains });
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  console.log('[SessionBridge] Received message type:', message.type);
  switch (message.type) {
    case 'WRITE_SESSION':
      console.log('[SessionBridge] Processing WRITE_SESSION for:', (message as WriteSessionMessage).domain);
      handleWriteSession(message, sendResponse);
      return true; // async response

    case 'GET_STATUS':
      handleGetStatus(sendResponse);
      return true;

    case 'UPDATE_CONFIG':
      saveConfig(message.config).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'GET_CONFIG':
      getConfig().then((config) => {
        sendResponse({ success: true, config });
      });
      return true;
  }
});

// On install, initialize config
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get('config');
  if (!existing.config) {
    await saveConfig(DEFAULT_CONFIG);
  }
  console.log('[SessionBridge] Extension installed. Default config loaded.');
});
