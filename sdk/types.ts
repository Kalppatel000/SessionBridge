export interface CsrfData {
  token: string;
  header: string;
}

export interface UserData {
  detected: boolean;
  displayName?: string;
  identifier?: string;
}

export interface SessionData {
  domain: string;
  cookies: string;
  csrf: CsrfData | null;
  user: UserData | null;
  timestamp: number;
  ttl: number;
}
