import { describe, expect, it } from 'vitest';
import type { GraphqlTweetResult } from '../src/lib/twitter-client-types.js';
import { extractMedia } from '../src/lib/twitter-client-utils.js';

describe('extractMedia', () => {
  it('returns undefined when no legacy data', () => {
    expect(extractMedia(undefined)).toBeUndefined();
    expect(extractMedia({})).toBeUndefined();
    expect(extractMedia({ legacy: {} })).toBeUndefined();
  });

  it('returns undefined when media array is empty', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: { media: [] },
      },
    };
    expect(extractMedia(result)).toBeUndefined();
  });

  it('extracts photo with dimensions and preview', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            {
              type: 'photo',
              media_url_https: 'https://pbs.twimg.com/media/test.jpg',
              sizes: {
                large: { w: 1920, h: 1080, resize: 'fit' },
                small: { w: 680, h: 383, resize: 'fit' },
              },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    expect(media).toHaveLength(1);
    const item = media?.[0];
    expect(item).toEqual({
      type: 'photo',
      url: 'https://pbs.twimg.com/media/test.jpg',
      width: 1920,
      height: 1080,
      previewUrl: 'https://pbs.twimg.com/media/test.jpg:small',
    });
  });

  it('falls back to medium size when large unavailable', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            {
              type: 'photo',
              media_url_https: 'https://pbs.twimg.com/media/test.jpg',
              sizes: {
                medium: { w: 1200, h: 675, resize: 'fit' },
              },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    const item = media?.[0];
    expect(item?.width).toBe(1200);
    expect(item?.height).toBe(675);
    expect(item?.previewUrl).toBeUndefined();
  });

  it('extracts video with highest bitrate mp4', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            {
              type: 'video',
              media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/123/img/thumb.jpg',
              sizes: {
                large: { w: 1280, h: 720, resize: 'fit' },
                small: { w: 680, h: 383, resize: 'fit' },
              },
              video_info: {
                duration_millis: 30000,
                variants: [
                  { bitrate: 256000, content_type: 'video/mp4', url: 'https://video.twimg.com/low.mp4' },
                  { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/high.mp4' },
                  { bitrate: 832000, content_type: 'video/mp4', url: 'https://video.twimg.com/medium.mp4' },
                  { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/pl.m3u8' },
                ],
              },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    expect(media).toHaveLength(1);
    const item = media?.[0];
    expect(item).toEqual({
      type: 'video',
      url: 'https://pbs.twimg.com/ext_tw_video_thumb/123/img/thumb.jpg',
      width: 1280,
      height: 720,
      previewUrl: 'https://pbs.twimg.com/ext_tw_video_thumb/123/img/thumb.jpg:small',
      videoUrl: 'https://video.twimg.com/high.mp4',
      durationMs: 30000,
    });
  });

  it('falls back to first mp4 when bitrate is missing', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            {
              type: 'video',
              media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/123/img/thumb.jpg',
              video_info: {
                variants: [
                  { content_type: 'video/mp4', url: 'https://video.twimg.com/no-bitrate.mp4' },
                  { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/pl.m3u8' },
                ],
              },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    expect(media).toHaveLength(1);
    const item = media?.[0];
    expect(item?.videoUrl).toBe('https://video.twimg.com/no-bitrate.mp4');
  });

  it('extracts animated_gif with video url', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            {
              type: 'animated_gif',
              media_url_https: 'https://pbs.twimg.com/tweet_video_thumb/test.jpg',
              sizes: {
                large: { w: 480, h: 270, resize: 'fit' },
                small: { w: 480, h: 270, resize: 'fit' },
              },
              video_info: {
                variants: [
                  { bitrate: 0, content_type: 'video/mp4', url: 'https://video.twimg.com/tweet_video/test.mp4' },
                ],
              },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    expect(media).toHaveLength(1);
    const item = media?.[0];
    expect(item?.type).toBe('animated_gif');
    expect(item?.videoUrl).toBe('https://video.twimg.com/tweet_video/test.mp4');
    expect(item?.durationMs).toBeUndefined();
  });

  it('keeps zero duration for videos', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            {
              type: 'video',
              media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/zero.jpg',
              video_info: {
                duration_millis: 0,
                variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/zero.mp4' }],
              },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    expect(media).toHaveLength(1);
    const item = media?.[0];
    expect(item?.durationMs).toBe(0);
  });

  it('handles multiple media items', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            {
              type: 'photo',
              media_url_https: 'https://pbs.twimg.com/media/photo1.jpg',
              sizes: { large: { w: 800, h: 600, resize: 'fit' } },
            },
            {
              type: 'photo',
              media_url_https: 'https://pbs.twimg.com/media/photo2.jpg',
              sizes: { large: { w: 1024, h: 768, resize: 'fit' } },
            },
            {
              type: 'video',
              media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/vid.jpg',
              sizes: { large: { w: 1920, h: 1080, resize: 'fit' } },
              video_info: {
                duration_millis: 15000,
                variants: [{ bitrate: 1000000, content_type: 'video/mp4', url: 'https://video.twimg.com/vid.mp4' }],
              },
            },
          ],
        },
      },
    };

    const media = extractMedia(result) ?? [];
    expect(media).toHaveLength(3);
    const [first, second, third] = media;
    expect(first?.type).toBe('photo');
    expect(second?.type).toBe('photo');
    expect(third?.type).toBe('video');
    expect(third?.videoUrl).toBe('https://video.twimg.com/vid.mp4');
  });

  it('skips items missing type or url', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            { type: 'photo' } as never, // missing media_url_https
            { media_url_https: 'https://pbs.twimg.com/media/test.jpg' } as never, // missing type
            {
              type: 'photo',
              media_url_https: 'https://pbs.twimg.com/media/valid.jpg',
              sizes: { large: { w: 100, h: 100, resize: 'fit' } },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    expect(media).toHaveLength(1);
    const item = media?.[0];
    expect(item?.url).toBe('https://pbs.twimg.com/media/valid.jpg');
  });

  it('prefers extended_entities over entities', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        entities: {
          media: [
            {
              type: 'photo',
              media_url_https: 'https://pbs.twimg.com/media/from_entities.jpg',
              sizes: { large: { w: 100, h: 100, resize: 'fit' } },
            },
          ],
        },
        extended_entities: {
          media: [
            {
              type: 'photo',
              media_url_https: 'https://pbs.twimg.com/media/from_extended.jpg',
              sizes: { large: { w: 200, h: 200, resize: 'fit' } },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    const item = media?.[0];
    expect(item?.url).toBe('https://pbs.twimg.com/media/from_extended.jpg');
  });

  it('falls back to entities when extended_entities missing', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        entities: {
          media: [
            {
              type: 'photo',
              media_url_https: 'https://pbs.twimg.com/media/from_entities.jpg',
              sizes: { large: { w: 100, h: 100, resize: 'fit' } },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    const item = media?.[0];
    expect(item?.url).toBe('https://pbs.twimg.com/media/from_entities.jpg');
  });

  it('handles video without mp4 variants', () => {
    const result: GraphqlTweetResult = {
      legacy: {
        extended_entities: {
          media: [
            {
              type: 'video',
              media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/test.jpg',
              sizes: { large: { w: 1280, h: 720, resize: 'fit' } },
              video_info: {
                duration_millis: 10000,
                variants: [{ content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/pl.m3u8' }],
              },
            },
          ],
        },
      },
    };

    const media = extractMedia(result);
    const item = media?.[0];
    expect(item?.type).toBe('video');
    expect(item?.videoUrl).toBeUndefined();
    expect(item?.durationMs).toBe(10000);
  });
});
