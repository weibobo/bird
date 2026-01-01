import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient constructor', () => {
  it('should throw if authToken is missing', () => {
    expect(
      () =>
        new TwitterClient({
          cookies: { authToken: null, ct0: 'test', cookieHeader: null, source: null },
        }),
    ).toThrow('Both authToken and ct0 cookies are required');
  });

  it('should throw if ct0 is missing', () => {
    expect(
      () =>
        new TwitterClient({
          cookies: { authToken: 'test', ct0: null, cookieHeader: null, source: null },
        }),
    ).toThrow('Both authToken and ct0 cookies are required');
  });

  it('should create client with valid cookies', () => {
    const client = new TwitterClient({ cookies: validCookies });
    expect(client).toBeInstanceOf(TwitterClient);
  });
});

describe('TwitterClient tweet', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  it('should post a tweet successfully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          create_tweet: {
            tweet_results: {
              result: {
                rest_id: '1234567890',
                legacy: {
                  full_text: 'Hello world!',
                },
              },
            },
          },
        },
      }),
    });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Hello world!');

    expect(result.success).toBe(true);
    expect(result.tweetId).toBe('1234567890');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('CreateTweet');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body);
    expect(body.variables.tweet_text).toBe('Hello world!');
    expect(body.features.rweb_video_screen_enabled).toBe(true);
    expect(body.features.creator_subscriptions_tweet_preview_api_enabled).toBe(true);
  });

  it('supports attaching media IDs', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          create_tweet: {
            tweet_results: {
              result: {
                rest_id: '1234567890',
              },
            },
          },
        },
      }),
    });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Hello world!', ['111', '222']);

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.variables.media.media_entities).toEqual([
      { media_id: '111', tagged_users: [] },
      { media_id: '222', tagged_users: [] },
    ]);
  });

  it('retries CreateTweet via /i/api/graphql when operation URL 404s', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            create_tweet: {
              tweet_results: {
                result: {
                  rest_id: '1234567890',
                },
              },
            },
          },
        }),
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Hello world!');

    expect(result.success).toBe(true);
    expect(result.tweetId).toBe('1234567890');
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const [firstUrl] = mockFetch.mock.calls[0];
    const [thirdUrl] = mockFetch.mock.calls[2];
    expect(String(firstUrl)).toContain('/CreateTweet');
    expect(String(thirdUrl)).toBe('https://x.com/i/api/graphql');
  });

  it('should handle API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        errors: [{ message: 'Rate limit exceeded', code: 88 }],
      }),
    });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Rate limit exceeded');
  });

  it('falls back to statuses/update.json when CreateTweet returns code 226', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [
            {
              message: 'Authorization: This request looks like it might be automated.',
              code: 226,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id_str: '1234567890',
        }),
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Hello world!');

    expect(result.success).toBe(true);
    expect(result.tweetId).toBe('1234567890');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1][0])).toContain('statuses/update.json');
  });

  it('surfaces statuses/update.json failure when CreateTweet returns code 226', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [
            {
              message: 'Authorization: This request looks like it might be automated.',
              code: 226,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => 'Forbidden',
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Hello world!');

    expect(result.success).toBe(false);
    expect(result.error).toContain('(226)');
    expect(result.error).toContain('fallback: HTTP 403');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[1][0])).toContain('statuses/update.json');
  });

  it('surfaces statuses/update.json API errors when CreateTweet returns code 226', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [
            {
              message: 'Authorization: This request looks like it might be automated.',
              code: 226,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [{ message: 'Nope', code: 999 }],
        }),
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Hello world!');

    expect(result.success).toBe(false);
    expect(result.error).toContain('(226)');
    expect(result.error).toContain('fallback: Nope (999)');
  });

  it('surfaces statuses/update.json missing id when CreateTweet returns code 226', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [
            {
              message: 'Authorization: This request looks like it might be automated.',
              code: 226,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Hello world!');

    expect(result.success).toBe(false);
    expect(result.error).toContain('(226)');
    expect(result.error).toContain('fallback: Tweet created but no ID returned');
  });

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('HTTP 403');
  });

  it('should handle network errors', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Test');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('should surface missing tweet ID when API responds without rest_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          create_tweet: {
            tweet_results: {
              result: {
                legacy: { full_text: 'No id' },
              },
            },
          },
        },
      }),
    });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.tweet('Hello world!');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Tweet created but no ID returned');
  });
});

describe('TwitterClient reply', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  it('should post a reply with correct reply_to_tweet_id', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          create_tweet: {
            tweet_results: {
              result: {
                rest_id: '9876543210',
              },
            },
          },
        },
      }),
    });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.reply('This is a reply', '1234567890');

    expect(result.success).toBe(true);
    expect(result.tweetId).toBe('9876543210');

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.variables.reply.in_reply_to_tweet_id).toBe('1234567890');
    expect(body.variables.tweet_text).toBe('This is a reply');
    expect(body.features.rweb_video_screen_enabled).toBe(true);
    expect(body.features.creator_subscriptions_tweet_preview_api_enabled).toBe(true);
  });

  it('falls back to statuses/update.json for replies when CreateTweet returns code 226', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          errors: [
            {
              message: 'Authorization: This request looks like it might be automated.',
              code: 226,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id_str: '999',
        }),
      });

    const client = new TwitterClient({ cookies: validCookies });
    const result = await client.reply('This is a reply', '1234567890', ['111', '222']);

    expect(result.success).toBe(true);
    expect(result.tweetId).toBe('999');
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [, options] = mockFetch.mock.calls[1];
    expect(String(mockFetch.mock.calls[1][0])).toContain('statuses/update.json');
    expect(options.method).toBe('POST');
    expect(options.body).toContain('status=This+is+a+reply');
    expect(options.body).toContain('in_reply_to_status_id=1234567890');
    expect(options.body).toContain('auto_populate_reply_metadata=true');
    expect(options.body).toContain('media_ids=111%2C222');
  });
});
