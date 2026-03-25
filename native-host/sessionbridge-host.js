#!/usr/bin/env node

/**
 * SessionBridge Native Messaging Host
 *
 * Receives session data from the Chrome extension via native messaging
 * and writes it to ~/.sessionbridge/<domain>/session.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SESSION_DIR = path.join(os.homedir(), '.sessionbridge');
const LOG_FILE = path.join(SESSION_DIR, 'host.log');

function log(msg) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
  } catch {
    // ignore logging errors
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

// Ensure base directory exists first (needed for logging)
ensureDir(SESSION_DIR);

log('Native host started');

function writeSession(data) {
  const domain = data.domain;
  if (!domain) {
    return { success: false, error: 'Missing domain' };
  }

  const domainDir = path.join(SESSION_DIR, domain);
  ensureDir(domainDir);

  const sessionFile = path.join(domainDir, 'session.json');
  const sessionData = {
    domain: data.domain,
    cookies: data.cookies || '',
    csrf: data.csrf || null,
    user: data.user || null,
    timestamp: data.timestamp || Date.now(),
    ttl: data.ttl || 1800,
  };

  fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2), {
    mode: 0o600,
  });

  log(`Session written for ${domain} → ${sessionFile}`);
  return { success: true, path: sessionFile };
}

function readSessionAction(data) {
  const domain = data.domain;
  if (!domain) {
    return { success: false, error: 'Missing domain' };
  }

  const sessionFile = path.join(SESSION_DIR, domain, 'session.json');
  if (!fs.existsSync(sessionFile)) {
    return { success: false, error: 'No session found for domain: ' + domain };
  }

  const content = fs.readFileSync(sessionFile, 'utf-8');
  return { success: true, session: JSON.parse(content) };
}

function listSessions() {
  ensureDir(SESSION_DIR);
  const sessions = [];

  const entries = fs.readdirSync(SESSION_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const sessionFile = path.join(SESSION_DIR, entry.name, 'session.json');
    if (fs.existsSync(sessionFile)) {
      try {
        const content = fs.readFileSync(sessionFile, 'utf-8');
        const session = JSON.parse(content);
        const age = (Date.now() - session.timestamp) / 1000;
        sessions.push({
          domain: session.domain,
          timestamp: session.timestamp,
          age: Math.round(age),
          fresh: age < session.ttl,
          user: session.user,
        });
      } catch {
        // skip malformed sessions
      }
    }
  }

  return { success: true, sessions };
}

function ping() {
  return { success: true, version: '1.0.0', host: 'sessionbridge' };
}

function handleMessage(message) {
  switch (message.action) {
    case 'write_session':
      return writeSession(message);
    case 'read_session':
      return readSessionAction(message);
    case 'list_sessions':
      return listSessions();
    case 'ping':
      return ping();
    default:
      return { success: false, error: 'Unknown action: ' + message.action };
  }
}

function sendMessage(message) {
  const json = JSON.stringify(message);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  const out = Buffer.concat([header, Buffer.from(json)]);
  process.stdout.write(out, () => {
    // Exit after response is flushed
    process.exit(0);
  });
}

// Read exactly N bytes from stdin synchronously
function readBytes(fd, n) {
  const buf = Buffer.alloc(n);
  let offset = 0;
  while (offset < n) {
    try {
      const bytesRead = fs.readSync(fd, buf, offset, n - offset, null);
      if (bytesRead === 0) {
        log('stdin closed before reading enough bytes');
        process.exit(1);
      }
      offset += bytesRead;
    } catch (err) {
      log('Error reading stdin: ' + err.message);
      process.exit(1);
    }
  }
  return buf;
}

try {
  // Read the 4-byte length header
  const header = readBytes(0, 4);
  const messageLength = header.readUInt32LE(0);
  log(`Received message length: ${messageLength}`);

  if (messageLength === 0 || messageLength > 1024 * 1024) {
    log(`Invalid message length: ${messageLength}`);
    sendMessage({ success: false, error: 'Invalid message length' });
  } else {
    // Read the message body
    const body = readBytes(0, messageLength);
    const messageJson = body.toString('utf-8');
    log(`Received message: ${messageJson.substring(0, 200)}`);

    const message = JSON.parse(messageJson);
    const response = handleMessage(message);
    log(`Sending response: ${JSON.stringify(response).substring(0, 200)}`);
    sendMessage(response);
  }
} catch (err) {
  log(`Fatal error: ${err.message}\n${err.stack}`);
  sendMessage({ success: false, error: err.message });
}
