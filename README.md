# SessionBridge

**Share browser sessions with MCP servers — zero API keys, zero passwords, zero OAuth setup.**

SessionBridge is a Chrome extension that captures your existing browser session (cookies + CSRF tokens) and makes them available to local MCP servers. Just log in via your browser as you normally would, and any compatible MCP server can authenticate API calls using that session.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
  - [Step 1: Install the Chrome Extension](#step-1-install-the-chrome-extension)
  - [Step 2: Install the Native Messaging Host](#step-2-install-the-native-messaging-host)
  - [Step 3: Verify the Extension is Working](#step-3-verify-the-extension-is-working)
- [Using with ServiceNow MCP Server](#using-with-servicenow-mcp-server)
  - [Install the MCP Server](#install-the-mcp-server)
  - [Configure Claude Code](#configure-claude-code)
  - [Configure Claude Desktop](#configure-claude-desktop)
  - [Example Prompts](#example-prompts)
- [Adding Custom Domains](#adding-custom-domains)
- [SDK for MCP Developers](#sdk-for-mcp-developers)
- [Troubleshooting](#troubleshooting)
- [Architecture](#architecture)
- [Security](#security)
- [Project Structure](#project-structure)

---

## How It Works

```
Chrome Browser (SSO session)
        │
        ▼
SessionBridge Extension ──► captures cookies + CSRF tokens
        │
        ▼ (native messaging)
Native Host ──► writes ~/.sessionbridge/<domain>/session.json
        │
        ▼ (file read)
MCP Server ──► authenticates API calls using session data
```

1. You log into a website (e.g., ServiceNow) in Chrome as you normally would
2. The **SessionBridge extension** detects the configured domain, captures cookies and CSRF tokens
3. The **native messaging host** writes session data to a local file
4. Any **MCP server** reads that file to authenticate API calls — no credentials needed

---

## Prerequisites

- **Google Chrome** (or Chromium-based browser)
- **Node.js** v18 or later — [install via nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org/)
- **macOS** or **Linux** (Windows support coming soon)

---

## Installation

### Step 1: Install the Chrome Extension

1. Clone this repository:
   ```bash
   git clone https://github.com/your-org/SessionBridge.git
   cd SessionBridge
   ```

2. Build the extension:
   ```bash
   cd extension
   npm install
   npm run build
   ```

3. Load the extension in Chrome:
   - Open `chrome://extensions` in Chrome
   - Enable **Developer mode** (toggle in top-right corner)
   - Click **"Load unpacked"**
   - Select the `extension/dist/` directory
   - The SessionBridge extension icon will appear in your toolbar

4. Copy your **Extension ID** — you'll need it in the next step:
   - On `chrome://extensions`, find SessionBridge
   - The ID is a long string like `olgdpopjjbbalilgblelgccmnldfnoel`

### Step 2: Install the Native Messaging Host

The native messaging host is a small Node.js script that bridges Chrome and the local filesystem.

```bash
cd native-host
EXTENSION_ID=<paste-your-extension-id> ./install.sh
```

Or run without the environment variable to be prompted:
```bash
cd native-host
./install.sh
```

The installer will:
- Copy the host script to `~/.sessionbridge/`
- Register the native messaging manifest with Chrome
- Create the `~/.sessionbridge/` directory with secure permissions
- Create a default config with ServiceNow and Jira pre-configured

**After installation, fully quit and restart Chrome** (Cmd+Q on macOS, not just close windows).

### Step 3: Verify the Extension is Working

1. Open a website you have configured (e.g., your ServiceNow instance)
2. Open Chrome DevTools (F12 or Cmd+Shift+I)
3. In the Console, look for:
   ```
   [SessionBridge] Domain matched: yourinstance.service-now.com → *.service-now.com
   [SessionBridge] Session captured for yourinstance.service-now.com
   ```
4. Verify the session file was written:
   ```bash
   cat ~/.sessionbridge/yourinstance.service-now.com/session.json
   ```
   You should see JSON with cookies, CSRF token, and a timestamp.

---

## Using with ServiceNow MCP Server

SessionBridge works with a fork of [echelon-ai-labs/servicenow-mcp](https://github.com/echelon-ai-labs/servicenow-mcp) that adds `session_bridge` authentication support.

### Install the MCP Server

1. Clone the fork:
   ```bash
   git clone https://github.com/Kalppatel000/servicenow-mcp.git
   cd servicenow-mcp
   ```

2. Install dependencies (requires [uv](https://docs.astral.sh/uv/)):
   ```bash
   uv python install 3.11
   uv sync --python 3.11
   ```

   Or with pip:
   ```bash
   python3.11 -m venv .venv
   source .venv/bin/activate
   pip install -e .
   ```

### Configure Claude Code

Create a `.mcp.json` file in your project root:

```json
{
  "mcpServers": {
    "servicenow": {
      "command": "/path/to/servicenow-mcp/.venv/bin/python",
      "args": ["-m", "servicenow_mcp.cli"],
      "env": {
        "SERVICENOW_AUTH_TYPE": "session_bridge"
      }
    }
  }
}
```

That's it. No instance URL, no username, no password. The server auto-discovers your ServiceNow instance from the SessionBridge session files.

If you have multiple ServiceNow instances, specify which one:

```json
{
  "mcpServers": {
    "servicenow": {
      "command": "/path/to/servicenow-mcp/.venv/bin/python",
      "args": ["-m", "servicenow_mcp.cli"],
      "env": {
        "SERVICENOW_AUTH_TYPE": "session_bridge",
        "SESSIONBRIDGE_DOMAIN": "myinstance.service-now.com"
      }
    }
  }
}
```

### Configure Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "servicenow": {
      "command": "/path/to/servicenow-mcp/.venv/bin/python",
      "args": ["-m", "servicenow_mcp.cli"],
      "env": {
        "SERVICENOW_AUTH_TYPE": "session_bridge"
      }
    }
  }
}
```

### Example Prompts

Once configured, restart Claude Code / Claude Desktop and try:

- **List incidents:**
  ```
  Show me the 5 most recent incidents on my ServiceNow instance.
  Include the number, short description, priority, and current state.
  ```

- **Create an incident:**
  ```
  Create a new incident with short description "Test from SessionBridge"
  and description "Created via MCP using browser session auth" with priority 3.
  ```

- **Look up a user:**
  ```
  Find the user record for kalp.patel in ServiceNow.
  ```

- **Search knowledge base:**
  ```
  Search the knowledge base for articles about VPN setup.
  ```

---

## Adding Custom Domains

SessionBridge comes pre-configured for:

| Platform | Domain Pattern | CSRF Header |
|----------|---------------|-------------|
| ServiceNow | `*.service-now.com` | `X-UserToken` |
| Jira | `*.atlassian.net` | `X-Atlassian-Token` |
| Salesforce | `*.salesforce.com` | `X-SFDC-Session` |
| GitHub | `github.com` | `X-CSRF-Token` |

### Via the Extension Popup

1. Click the SessionBridge icon in Chrome toolbar
2. Click **"+ Add Domain"**
3. Fill in:
   - **Domain Pattern:** e.g., `*.example.com`
   - **CSRF Selector:** e.g., `meta[name='csrf-token']`
   - **CSRF Header Name:** e.g., `X-CSRF-Token`
4. Click **Save**

### Via Config File

Edit `~/.sessionbridge/config.json`:

```json
{
  "domains": {
    "*.service-now.com": {
      "csrfSelectors": ["input[name='sysparm_ck']"],
      "csrfHeader": "X-UserToken",
      "refreshInterval": 600,
      "sessionTTL": 1800
    },
    "*.your-saas.com": {
      "csrfSelectors": ["meta[name='csrf-token']"],
      "csrfHeader": "X-CSRF-Token",
      "refreshInterval": 600,
      "sessionTTL": 3600
    }
  }
}
```

**Config options:**
- `csrfSelectors` — CSS selectors to find the CSRF token in the page DOM
- `csrfHeader` — HTTP header name to send the CSRF token with
- `refreshInterval` — How often to re-capture the session (in seconds)
- `sessionTTL` — How long the session is considered fresh (in seconds)

---

## SDK for MCP Developers

If you're building your own MCP server and want to use SessionBridge for auth, install the SDK:

```bash
cd sdk
npm install
npm run build
```

### Usage

```typescript
import { readSession, validateSession, getAuthHeaders } from '@sessionbridge/sdk';

// Read session for a domain
const session = await readSession('yourinstance.service-now.com');

if (!session) {
  throw new Error('No active session. Open the site in Chrome first.');
}

// Check if session is still fresh
if (!validateSession(session)) {
  throw new Error('Session expired. Refresh by visiting the site in Chrome.');
}

// Get auth headers (Cookie + CSRF)
const headers = getAuthHeaders(session);
// Returns: { Cookie: "...", "X-UserToken": "..." }

const response = await fetch('https://yourinstance.service-now.com/api/now/table/incident', {
  headers,
});
```

### API Reference

| Function | Description |
|----------|-------------|
| `readSession(domain)` | Read session file for a domain. Returns `null` if not found. |
| `readSessionSync(domain)` | Synchronous version of `readSession`. |
| `validateSession(session)` | Check if session is within its TTL. |
| `getAuthHeaders(session)` | Get `Cookie` + CSRF headers as a `Record<string, string>`. |
| `listSessions()` | List all sessions with freshness status. |
| `getFreshSession(domain)` | Read + validate in one call. Returns `null` if missing or stale. |

### Session Data Format

```typescript
interface SessionData {
  domain: string;       // e.g., "yourinstance.service-now.com"
  cookies: string;      // Cookie header string
  csrf: {
    token: string;      // CSRF token value
    header: string;     // Header name, e.g., "X-UserToken"
  } | null;
  user: {
    detected: boolean;
    displayName?: string;
    identifier?: string;
  } | null;
  timestamp: number;    // Capture time (milliseconds since epoch)
  ttl: number;          // Time-to-live in seconds
}
```

---

## Troubleshooting

### "Native host has exited" error in Chrome console

**Cause:** Chrome can't launch the native messaging host.

**Fix:**
1. Verify the native host is installed:
   ```bash
   cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.sessionbridge.native.json
   ```
2. Check the `path` points to an existing file:
   ```bash
   ls -la ~/.sessionbridge/native-host.sh
   ```
3. Make sure you fully restarted Chrome after installing (Cmd+Q, not just close)
4. Check the host log:
   ```bash
   cat ~/.sessionbridge/host.log
   ```

### Extension matches domain but no session file is created

**Cause:** The content script runs but the service worker or native host fails silently.

**Fix:**
1. Open `chrome://extensions` → Click **"Service worker"** under SessionBridge
2. Check the console for error messages
3. Ensure the extension ID in `com.sessionbridge.native.json` matches `chrome://extensions`

### Session file exists but MCP server fails to authenticate

**Cause:** Session may be stale or missing CSRF token.

**Fix:**
1. Check session freshness:
   ```bash
   cat ~/.sessionbridge/yourinstance.service-now.com/session.json | python3 -c "
   import json, sys, time
   s = json.load(sys.stdin)
   age = time.time() - s['timestamp']/1000
   print(f'Age: {int(age)}s, TTL: {s[\"ttl\"]}s, Fresh: {age < s[\"ttl\"]}')
   print(f'CSRF: {s[\"csrf\"][\"token\"][:20]}...' if s.get('csrf') else 'No CSRF')
   "
   ```
2. Visit the site in Chrome to refresh the session
3. Make sure you're logged in (not on a login page)

### MCP server can't find instance URL

**Cause:** No session file exists for auto-discovery.

**Fix:**
1. Ensure SessionBridge has captured at least one session:
   ```bash
   ls ~/.sessionbridge/
   ```
2. Or explicitly set the instance URL:
   ```json
   {
     "env": {
       "SERVICENOW_AUTH_TYPE": "session_bridge",
       "SERVICENOW_INSTANCE_URL": "https://yourinstance.service-now.com"
     }
   }
   ```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Chrome Browser (user logged in via SSO)                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  SessionBridge Extension                          │  │
│  │  - Detects configured domains                     │  │
│  │  - Captures cookies via chrome.cookies.getAll()   │  │
│  │  - Extracts CSRF tokens from page DOM             │  │
│  │  - Sends to service worker                        │  │
│  └──────────────────────┬────────────────────────────┘  │
│                         │ chrome.runtime.sendMessage     │
│  ┌──────────────────────▼────────────────────────────┐  │
│  │  Service Worker (background.js)                   │  │
│  │  - Retrieves all cookies (incl. httpOnly)         │  │
│  │  - Sends via native messaging                     │  │
│  └──────────────────────┬────────────────────────────┘  │
└─────────────────────────┼───────────────────────────────┘
                          │ Native Messaging (stdio)
┌─────────────────────────▼───────────────────────────────┐
│  Native Messaging Host (~/.sessionbridge/native-host.sh)│
│  - Receives session data                                │
│  - Writes to ~/.sessionbridge/<domain>/session.json     │
│  - Each domain gets its own session file                │
└─────────────────────────┬───────────────────────────────┘
                          │ File system
┌─────────────────────────▼───────────────────────────────┐
│  ~/.sessionbridge/                                      │
│  ├── config.json                                        │
│  ├── yourinstance.service-now.com/                      │
│  │   └── session.json                                   │
│  └── jira.atlassian.net/                                │
│      └── session.json                                   │
└─────────────────────────┬───────────────────────────────┘
                          │ File read
┌─────────────────────────▼───────────────────────────────┐
│  MCP Server (e.g., servicenow-mcp)                      │
│  - Reads session.json for the target domain             │
│  - Uses cookies + CSRF as auth headers                  │
│  - Auto-discovers instance URL from session files       │
└─────────────────────────────────────────────────────────┘
```

---

## Security

- Session files are created with `0600` permissions (owner-only read/write)
- Session directory `~/.sessionbridge/` uses `0700` permissions
- Sessions expire based on configurable TTL (default: 30 minutes for ServiceNow)
- No credentials are stored — only session cookies that expire with the browser session
- The native messaging host only communicates with the registered Chrome extension (verified by extension ID)
- Session data never leaves your machine — it goes from Chrome to a local file

---

## Project Structure

```
SessionBridge/
├── extension/                      # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── src/
│   │   ├── background.ts           # Service worker: cookie retrieval, native messaging
│   │   ├── content.ts              # Content script: CSRF detection, session trigger
│   │   ├── popup.ts                # Popup UI: domain management, status display
│   │   ├── popup.html
│   │   └── popup.css
│   ├── webpack.config.js
│   └── package.json
├── native-host/                    # Native Messaging Host
│   ├── sessionbridge-host.js       # Receives messages, writes session files
│   ├── install.sh                  # Cross-platform installer
│   └── com.sessionbridge.native.json  # Manifest template
├── sdk/                            # SDK for MCP server developers
│   ├── index.ts                    # readSession(), validateSession(), getAuthHeaders()
│   ├── types.ts                    # SessionData interface
│   └── package.json
├── .mcp.json                       # MCP server config for Claude Code
├── package.json
├── tsconfig.json
└── README.md
```

---

## License

MIT
