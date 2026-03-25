import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export { SessionData, CsrfData, UserData } from './types';
import type { SessionData } from './types';

const SESSION_DIR = path.join(os.homedir(), '.sessionbridge');

/**
 * Read a session for a specific domain.
 * Returns null if no session file exists.
 */
export async function readSession(domain: string): Promise<SessionData | null> {
  const sessionFile = path.join(SESSION_DIR, domain, 'session.json');

  try {
    const content = await fs.promises.readFile(sessionFile, 'utf-8');
    return JSON.parse(content) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Synchronous version of readSession.
 */
export function readSessionSync(domain: string): SessionData | null {
  const sessionFile = path.join(SESSION_DIR, domain, 'session.json');

  try {
    const content = fs.readFileSync(sessionFile, 'utf-8');
    return JSON.parse(content) as SessionData;
  } catch {
    return null;
  }
}

/**
 * Check if a session is still valid (within TTL).
 */
export function validateSession(session: SessionData): boolean {
  const age = (Date.now() - session.timestamp) / 1000;
  return age < session.ttl;
}

/**
 * Get authentication headers from a session.
 * Includes Cookie header and CSRF header if available.
 */
export function getAuthHeaders(session: SessionData): Record<string, string> {
  const headers: Record<string, string> = {
    Cookie: session.cookies,
  };

  if (session.csrf?.token && session.csrf?.header) {
    headers[session.csrf.header] = session.csrf.token;
  }

  return headers;
}

/**
 * List all available sessions with their freshness status.
 */
export async function listSessions(): Promise<(SessionData & { fresh: boolean })[]> {
  const sessions: (SessionData & { fresh: boolean })[] = [];

  try {
    const entries = await fs.promises.readdir(SESSION_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const sessionFile = path.join(SESSION_DIR, entry.name, 'session.json');
      try {
        const content = await fs.promises.readFile(sessionFile, 'utf-8');
        const session = JSON.parse(content) as SessionData;
        sessions.push({
          ...session,
          fresh: validateSession(session),
        });
      } catch {
        // skip malformed or missing sessions
      }
    }
  } catch {
    // directory doesn't exist yet
  }

  return sessions;
}

/**
 * Convenience: read and validate a session in one call.
 * Returns the session if fresh, null otherwise.
 */
export async function getFreshSession(domain: string): Promise<SessionData | null> {
  const session = await readSession(domain);
  if (!session) return null;
  return validateSession(session) ? session : null;
}
