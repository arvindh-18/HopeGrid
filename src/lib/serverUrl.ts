// src/lib/serverUrl.ts — where the HopeGrid server is. On the website the pages and the API share one site, so
// requests stay relative ('/api/…'). In the Android app (Capacitor) the pages live on the phone, so every request
// needs the server's full https address: set inside the app (Server settings) or baked in at build time with
// VITE_SERVER_URL. A saved address wins, so a new tunnel address never needs a new app build.
import { Capacitor } from '@capacitor/core';

const STORAGE_KEY = 'hopegrid.serverUrl';

export const isNativeApp = (): boolean => Capacitor.isNativePlatform();

/**
 * Cleans what a person typed into a server origin: adds https:// when missing, drops any path (e.g. a pasted
 * "/map" or "/api"), and refuses anything that isn't https (Android blocks plain-http requests from the app).
 */
export function normalizeServerUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !url.hostname.includes('.')) return null;
  return url.origin;
}

function saved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** '' on the website (same site). In the app: the saved address, else the build-time one, else '' (not set up). */
export function serverUrl(): string {
  if (!isNativeApp()) return '';
  return saved() ?? normalizeServerUrl(import.meta.env.VITE_SERVER_URL ?? '') ?? '';
}

export function setServerUrl(url: string): void {
  try { localStorage.setItem(STORAGE_KEY, url); } catch { /* storage blocked: the build-time address stays in use */ }
}

/** The app has no server address yet, so it shows the setup screen first. */
export const needsServerSetup = (): boolean => isNativeApp() && !serverUrl();

/**
 * Sent with every API request. A free ngrok address shows browser-looking requests (the app, Vercel's forwarding) a
 * "You are about to visit" page instead of the data, unless this header is present. Other hosts ignore it.
 */
export const TUNNEL_HEADERS: Readonly<Record<string, string>> = { 'ngrok-skip-browser-warning': '1' };

/** Address for links other people open in a browser (e.g. the WhatsApp message): the server also serves the website. */
export function publicWebUrl(): string {
  return serverUrl() || window.location.origin;
}
