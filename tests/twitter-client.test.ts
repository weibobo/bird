import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';

describe('TwitterClient', () => {
  const originalFetch = global.fetch;
  const validCookies = {
    authToken: 'test_auth_token',
    ct0: 'test_ct0_token',
    source: 'test',
  };

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should throw if authToken is missing', () => {
      expect(
        () =>
          new TwitterClient({
            cookies: { authToken: null, ct0: 'test', source: null },
          }),
      ).toThrow('Both authToken and ct0 cookies are required');
    });

    it('should throw if ct0 is missing', () => {
      expect(
        () =>
          new TwitterClient({
            cookies: { authToken: 'test', ct0: null, source: null },
          }),
      ).toThrow('Both authToken and ct0 cookies are required');
    });

    it('should create client with valid cookies', () => {
      const client = new TwitterClient({ cookies: validCookies });
      expect(client).toBeInstanceOf(TwitterClient);
    });
  });

  describe('tweet', () => {
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

  describe('reply', () => {
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
    });
  });

  describe('getTweet', () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    it('should return tweet data from root tweetResult', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            tweetResult: {
              result: {
                rest_id: '12345',
                legacy: {
                  full_text: 'Root tweet text',
                  created_at: 'Mon Jan 01 00:00:00 +0000 2024',
                  reply_count: 1,
                  retweet_count: 2,
                  favorite_count: 3,
                },
                core: {
                  user_results: {
                    result: {
                      legacy: {
                        screen_name: 'user',
                        name: 'User Name',
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('12345');

      expect(result.success).toBe(true);
      expect(result.tweet?.id).toBe('12345');
      expect(result.tweet?.text).toBe('Root tweet text');
      expect(result.tweet?.author.username).toBe('user');
    });

    it('should return tweet data found inside conversation instructions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            threaded_conversation_with_injections_v2: {
              instructions: [
                {
                  entries: [
                    {
                      content: {
                        itemContent: {
                          tweet_results: {
                            result: {
                              rest_id: '6789',
                              legacy: {
                                full_text: 'Nested text',
                                created_at: 'Mon Jan 01 00:00:00 +0000 2024',
                                reply_count: 0,
                                retweet_count: 0,
                                favorite_count: 0,
                              },
                              core: {
                                user_results: {
                                  result: {
                                    legacy: {
                                      screen_name: 'nestuser',
                                      name: 'Nested User',
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        }),
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('6789');

      expect(result.success).toBe(true);
      expect(result.tweet?.text).toBe('Nested text');
      expect(result.tweet?.author.username).toBe('nestuser');
    });

    it('should report HTTP errors from getTweet', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Not Found',
      });

      const client = new TwitterClient({ cookies: validCookies });
      const result = await client.getTweet('missing');

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 404');
    });
  });

  describe('getCurrentUser', () => {
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
  });
});
