import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient getCurrentUser', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  it('returns mapped user details when present', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user_id: '12345',
        screen_name: 'tester',
        name: 'Test User',
      }),
    });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.getCurrentUser();

    expect(result.success).toBe(true);
    expect(result.user).toEqual({ id: '12345', username: 'tester', name: 'Test User' });
    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('account/settings'), expect.any(Object));
  });

  it('returns error when response lacks identifiers', async () => {
    mockFetch.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ language: 'en' }),
      text: async () => '{"language":"en"}',
    }));

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.getCurrentUser();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Could not');
  });

  it('surfaces HTTP errors', async () => {
    mockFetch.mockImplementation(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }));

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.getCurrentUser();

    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 401');
  });

  it('uses HTML fallback when API endpoints 404', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html>"screen_name":"fallback","user_id":"999"</html>',
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.getCurrentUser();

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('fallback');
    expect(result.user?.id).toBe('999');
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('skips an endpoint when JSON parsing fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('bad json');
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user_id: '12345',
          screen_name: 'tester',
          name: 'Test User',
        }),
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.getCurrentUser();

    expect(result.success).toBe(true);
    expect(result.user).toEqual({ id: '12345', username: 'tester', name: 'Test User' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('continues on fetch errors and still succeeds via HTML fallback', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
      .mockRejectedValueOnce(new Error('settings boom'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '<html>"screen_name":"fallback","user_id":"999"</html>',
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.getCurrentUser();

    expect(result.success).toBe(true);
    expect(result.user?.username).toBe('fallback');
    expect(result.user?.id).toBe('999');
  });
});
