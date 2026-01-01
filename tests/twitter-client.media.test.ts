import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TwitterClient } from '../src/lib/twitter-client.js';
import { validCookies } from './twitter-client-fixtures.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('TwitterClient uploadMedia', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  it('uploads an image and sets alt text', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ media_id_string: '999' }),
      })
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
      });

    const client = new TwitterClient({ cookies: validCookies });
    const data = new Uint8Array([1, 2, 3, 4]);
    const result = await client.uploadMedia({ data, mimeType: 'image/png', alt: 'alt text' });

    expect(result.success).toBe(true);
    expect(result.mediaId).toBe('999');
    expect(mockFetch).toHaveBeenCalledTimes(4);

    const [initUrl, initOptions] = mockFetch.mock.calls[0];
    expect(String(initUrl)).toContain('upload.twitter.com');
    expect(initOptions.method).toBe('POST');
    expect(initOptions.body).toBeInstanceOf(URLSearchParams);
    expect((initOptions.body as URLSearchParams).get('command')).toBe('INIT');
    expect((initOptions.body as URLSearchParams).get('media_type')).toBe('image/png');

    const [, appendOptions] = mockFetch.mock.calls[1];
    expect(appendOptions.method).toBe('POST');
    expect(appendOptions.body).toBeInstanceOf(FormData);
    const appendBody = appendOptions.body as FormData;
    expect(appendBody.get('command')).toBe('APPEND');
    expect(appendBody.get('media_id')).toBe('999');
    expect(appendBody.get('segment_index')).toBe('0');
    expect(appendBody.get('media')).toBeInstanceOf(Blob);

    const [, finalizeOptions] = mockFetch.mock.calls[2];
    expect(finalizeOptions.body).toBeInstanceOf(URLSearchParams);
    expect((finalizeOptions.body as URLSearchParams).get('command')).toBe('FINALIZE');
    expect((finalizeOptions.body as URLSearchParams).get('media_id')).toBe('999');

    const [metaUrl, metaOptions] = mockFetch.mock.calls[3];
    expect(String(metaUrl)).toContain('/media/metadata/create.json');
    expect(metaOptions.method).toBe('POST');
    expect(JSON.parse(metaOptions.body)).toEqual({ media_id: '999', alt_text: { text: 'alt text' } });
  });

  it('uploads a video and polls processing status', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ media_id_string: '777' }),
      })
      .mockResolvedValueOnce({
        ok: true,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ processing_info: { state: 'pending', check_after_secs: 0 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ processing_info: { state: 'succeeded' } }),
      });

    const client = new TwitterClient({ cookies: validCookies });
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await client.uploadMedia({ data, mimeType: 'video/mp4', alt: 'ignored' });

    expect(result.success).toBe(true);
    expect(result.mediaId).toBe('777');
    expect(mockFetch).toHaveBeenCalledTimes(4);

    const [, finalizeOptions] = mockFetch.mock.calls[2];
    expect((finalizeOptions.body as URLSearchParams).get('command')).toBe('FINALIZE');

    const [statusUrl] = mockFetch.mock.calls[3];
    expect(String(statusUrl)).toContain('command=STATUS');
  });
});
