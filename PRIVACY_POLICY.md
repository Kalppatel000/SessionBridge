# SessionBridge — Privacy Policy

**Last updated:** March 25, 2026

## Overview

SessionBridge is a Chrome extension that captures browser session data (cookies and CSRF tokens) from user-configured domains and writes them to the user's local filesystem via Chrome's native messaging API. This privacy policy explains what data is collected, how it is used, and how it is stored.

## Data Collection

SessionBridge collects the following data **only from domains explicitly configured by the user**:

- **Cookies:** All cookies associated with the configured domain, including httpOnly cookies, retrieved via the Chrome cookies API.
- **CSRF Tokens:** Anti-forgery tokens extracted from the page DOM using CSS selectors configured per domain.
- **User Identity (optional):** If detectable from the page DOM (e.g., username or display name from meta tags), this is captured for display purposes only.

## Data That Is NOT Collected

- No browsing history
- No personal information beyond what is on the configured pages
- No data from domains that are not explicitly configured by the user
- No keystrokes, form inputs, or page content beyond CSRF tokens
- No analytics, telemetry, or usage tracking of any kind

## How Data Is Used

Captured session data is used for a single purpose: to enable local MCP (Model Context Protocol) servers running on the user's own machine to authenticate API calls to the configured domains using the user's existing browser session.

## Data Storage

- All session data is written to the **local filesystem** at `~/.sessionbridge/<domain>/session.json` via a native messaging host installed on the user's machine.
- Session files are created with **owner-only permissions** (0600), meaning only the user's operating system account can read them.
- The `~/.sessionbridge/` directory is protected with **0700 permissions**.
- Session data **expires automatically** based on a configurable TTL (time-to-live), defaulting to 30 minutes for ServiceNow and 60 minutes for other platforms.
- No data is stored in cloud services, remote databases, or any external systems.

## Data Transmission

- Session data is transmitted **only** between the Chrome extension and the locally installed native messaging host via Chrome's native messaging protocol (stdio).
- **No data is sent to any external server, third-party service, or remote endpoint.**
- **No network requests are made by the extension.**
- The native messaging host runs entirely on the user's local machine.

## Third-Party Access

- No third parties have access to any data collected by SessionBridge.
- The extension contains no third-party analytics, advertising, or tracking code.
- The extension makes no outbound network connections.

## User Control

- Users have full control over which domains are monitored via the extension popup or the local configuration file (`~/.sessionbridge/config.json`).
- Users can remove any domain configuration at any time via the popup UI.
- Users can delete all session data at any time by removing the `~/.sessionbridge/` directory.
- Uninstalling the extension stops all data collection immediately. Previously written session files remain on disk until manually deleted.

## Chrome Permissions

| Permission | Purpose |
|---|---|
| `storage` | Store domain configuration locally within Chrome |
| `activeTab` | Check if the current tab matches a configured domain |
| `nativeMessaging` | Communicate with the local native messaging host to write session files |
| `cookies` | Retrieve cookies (including httpOnly) for configured domains |
| `<all_urls>` (host) | Run content script on user-configured domains to extract CSRF tokens |

## Changes to This Policy

Any changes to this privacy policy will be posted to this page with an updated date. Significant changes will be noted in the extension's changelog.

## Contact

For questions or concerns about this privacy policy, please open an issue at: https://github.com/Kalppatel000/SessionBridge/issues
