import { describe, expect, it } from 'vitest';
import { normalizeServerUrl } from '../src/lib/serverUrl';

describe('Android app server address', () => {
  it('accepts a pasted tunnel link in any common form and keeps only the origin', () => {
    const want = 'https://abc-xyz.trycloudflare.com';
    for (const typed of ['https://abc-xyz.trycloudflare.com', ' abc-xyz.trycloudflare.com ', 'https://abc-xyz.trycloudflare.com/', 'https://abc-xyz.trycloudflare.com/map', 'https://ABC-xyz.trycloudflare.com/api/public/incidents']) {
      expect(normalizeServerUrl(typed)).toBe(want);
    }
  });
  it('refuses plain http, empty input and things that are not addresses', () => {
    for (const typed of ['http://abc-xyz.trycloudflare.com', '', '   ', 'hello', 'https://localhost', 'ftp://x.example']) {
      expect(normalizeServerUrl(typed)).toBeNull();
    }
  });
});
