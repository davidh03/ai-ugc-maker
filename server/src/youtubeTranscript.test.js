import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVideoId,
  fetchTranscript,
  enrichBrief,
} from './youtubeTranscript.js';

const VIDEO_ID = 'dQw4w9WgXcQ';

// Fixture HTML mimicking the relevant slice of a YouTube watch page.
function watchHtml(captionTracks) {
  const tracks = captionTracks
    ? `"captionTracks":${JSON.stringify(captionTracks)}`
    : '';
  return `<html><body><script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{${tracks}}}};</script></body></html>`;
}

const TRACK = {
  baseUrl: 'https://www.youtube.com/api/timedtext?v=' + VIDEO_ID + '&lang=en&fmt=json3',
  languageCode: 'en',
  kind: 'asr',
};

const VTT = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:03.000
Hello world this is a <b>test</b>

00:00:03.000 --> 00:00:06.000
Second line of the transcript
`;

// Mock fetch that dispatches on the URL: watch page -> HTML, timedtext -> VTT.
function makeFetch({ html = watchHtml([TRACK]), vtt = VTT, failWatch = false } = {}) {
  return async (url) => {
    if (url.includes('/watch?v=')) {
      if (failWatch) throw new Error('network down');
      return { ok: true, status: 200, text: async () => html };
    }
    if (url.includes('/api/timedtext')) {
      return { ok: true, status: 200, text: async () => vtt };
    }
    throw new Error('unexpected url: ' + url);
  };
}

describe('extractVideoId', () => {
  it('watch?v= (www)', () =>
    assert.equal(extractVideoId('https://www.youtube.com/watch?v=' + VIDEO_ID), VIDEO_ID));
  it('watch?v= with extra params', () =>
    assert.equal(extractVideoId('https://youtube.com/watch?t=5&v=' + VIDEO_ID + '&feature=share'), VIDEO_ID));
  it('youtu.be', () =>
    assert.equal(extractVideoId('check out https://youtu.be/' + VIDEO_ID + ' please'), VIDEO_ID));
  it('shorts', () =>
    assert.equal(extractVideoId('https://www.youtube.com/shorts/' + VIDEO_ID), VIDEO_ID));
  it('embed', () =>
    assert.equal(extractVideoId('https://www.youtube.com/embed/' + VIDEO_ID), VIDEO_ID));
  it('bare id', () =>
    assert.equal(extractVideoId(VIDEO_ID), VIDEO_ID));
  it('id boundary not greedy', () =>
    assert.equal(extractVideoId('https://youtu.be/' + VIDEO_ID + 'A'), null));
  it('non-youtube text', () =>
    assert.equal(extractVideoId('make a product teaser about coffee'), null));
  it('vimeo url is not a youtube id', () =>
    assert.equal(extractVideoId('https://vimeo.com/123456789'), null));
});

describe('fetchTranscript', () => {
  it('returns transcript text when captions exist', async () => {
    const text = await fetchTranscript(VIDEO_ID, { fetchImpl: makeFetch() });
    assert.equal(text, 'Hello world this is a test Second line of the transcript');
  });
  it('returns null when no caption tracks', async () => {
    const text = await fetchTranscript(VIDEO_ID, {
      fetchImpl: makeFetch({ html: watchHtml(null) }),
    });
    assert.equal(text, null);
  });
  it('returns null on network failure', async () => {
    const text = await fetchTranscript(VIDEO_ID, {
      fetchImpl: makeFetch({ failWatch: true }),
    });
    assert.equal(text, null);
  });
});

describe('enrichBrief', () => {
  const url = 'https://www.youtube.com/watch?v=' + VIDEO_ID;

  it('successful transcript injection preserves the URL', async () => {
    const { brief, meta } = await enrichBrief('Turn this into a video: ' + url, {
      fetchImpl: makeFetch(),
    });
    assert.equal(meta.detected, true);
    assert.equal(meta.videoId, VIDEO_ID);
    assert.equal(meta.transcriptFetched, true);
    assert.ok(brief.includes(url), 'original URL must be preserved');
    assert.ok(brief.includes('Hello world this is a test'));
    assert.ok(brief.includes('Second line of the transcript'));
  });

  it('graceful failure: captions disabled -> brief unchanged + warning', async () => {
    const input = 'Turn this into a video: ' + url;
    const { brief, meta } = await enrichBrief(input, {
      fetchImpl: makeFetch({ html: watchHtml(null) }),
    });
    assert.equal(brief, input, 'brief must be unchanged on failure');
    assert.equal(meta.detected, true);
    assert.equal(meta.transcriptFetched, false);
    assert.ok(meta.warning && meta.warning.length > 0);
  });

  it('graceful failure: network error -> no crash, warning recorded', async () => {
    const input = 'https://youtu.be/' + VIDEO_ID;
    const { brief, meta } = await enrichBrief(input, {
      fetchImpl: makeFetch({ failWatch: true }),
    });
    assert.equal(brief, input);
    assert.equal(meta.transcriptFetched, false);
    assert.ok(meta.warning);
  });

  it('disabled flag skips fetch entirely', async () => {
    let called = false;
    const { brief, meta } = await enrichBrief(url, {
      transcriptsEnabled: false,
      fetchImpl: async () => { called = true; throw new Error('should not run'); },
    });
    assert.equal(brief, url);
    assert.equal(called, false);
    assert.equal(meta.transcriptFetched, false);
    assert.ok(/disabled/.test(meta.warning));
  });

  it('no youtube url -> no-op', async () => {
    const { brief, meta } = await enrichBrief('a plain brief', { fetchImpl: makeFetch() });
    assert.equal(brief, 'a plain brief');
    assert.equal(meta.detected, false);
  });
});
