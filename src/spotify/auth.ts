// Authorization Code + PKCE — the flow Spotify recommends for apps with no backend.
// https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
const REDIRECT_URI =
  (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined) ?? `${window.location.origin}/callback`;
const SCOPES = ['user-library-read', 'user-top-read'];

const TOKEN_KEY = 'sleeve.token';
const VERIFIER_KEY = 'sleeve.verifier';
const STATE_KEY = 'sleeve.state';

type StoredToken = { access_token: string; refresh_token: string; expires_at: number };

export const isConfigured = Boolean(CLIENT_ID && CLIENT_ID !== 'your_client_id_here');

function randomString(length: number) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

async function codeChallenge(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

function saveToken(data: { access_token: string; refresh_token?: string; expires_in: number }) {
  const prev = readToken();
  const token: StoredToken = {
    access_token: data.access_token,
    // Spotify may or may not rotate the refresh token — keep the old one if not.
    refresh_token: data.refresh_token ?? prev?.refresh_token ?? '',
    expires_at: Date.now() + data.expires_in * 1000,
  };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function hasSession() {
  return readToken() !== null;
}

export async function login() {
  if (!CLIENT_ID) throw new Error('Missing VITE_SPOTIFY_CLIENT_ID');
  const verifier = randomString(64);
  const state = randomString(16);
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function postToken(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Token request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// StrictMode runs effects twice in dev; an auth code can only be exchanged once.
let callbackPromise: Promise<void> | null = null;

export function handleCallback(): Promise<void> {
  callbackPromise ??= (async () => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const code = params.get('code');
    const state = params.get('state');
    const verifier = localStorage.getItem(VERIFIER_KEY);

    try {
      if (error) throw new Error(error === 'access_denied' ? 'Spotify access was declined.' : error);
      if (!code || !verifier) throw new Error('Missing authorization code.');
      if (state !== localStorage.getItem(STATE_KEY)) throw new Error('State mismatch — please try again.');

      const data = await postToken({
        client_id: CLIENT_ID!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      });
      saveToken(data);
    } finally {
      localStorage.removeItem(VERIFIER_KEY);
      localStorage.removeItem(STATE_KEY);
      window.history.replaceState({}, '', '/');
    }
  })();
  return callbackPromise;
}

let refreshing: Promise<string | null> | null = null;

export async function getAccessToken(): Promise<string | null> {
  const token = readToken();
  if (!token) return null;
  if (token.expires_at - 60_000 > Date.now()) return token.access_token;
  if (!token.refresh_token) return null;

  refreshing ??= postToken({
    client_id: CLIENT_ID!,
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
  })
    .then((data) => {
      saveToken(data);
      return data.access_token as string;
    })
    .catch(() => {
      logout();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
}
