import { describe, expect, it, vi } from 'vitest';
import {
  extractNetflixSubtitleDownloads,
  extractNetflixTimedTextTracks,
  fetchNetflixSubtitlesFromManifest,
  parseNetflixTTML,
  selectNetflixSubtitleTracks,
} from './netflix-subtitles';

describe('netflix-subtitles', () => {
  it('extracts timed text tracks from Netflix manifest shapes', () => {
    const lowercase = { result: { timedtexttracks: [{ language: 'en' }] } };
    const camelCase = { result: { timedtextTracks: [{ language: 'tr' }] } };
    const direct = { timedtexttracks: [{ language: 'de' }] };

    expect(extractNetflixTimedTextTracks(lowercase)).toHaveLength(1);
    expect(extractNetflixTimedTextTracks(camelCase)[0].language).toBe('tr');
    expect(extractNetflixTimedTextTracks(direct)[0].language).toBe('de');
  });

  it('selects preferred-language normal subtitles before captions or forced tracks', () => {
    const manifest = {
      result: {
        timedtexttracks: [
          { language: 'en', rawTrackType: 'closedcaptions', ttDownloadables: { 'webvtt-lssdh-ios8': { downloadUrls: { a: 'https://cdn.example/cc.vtt' } } } },
          { language: 'en-US', rawTrackType: 'subtitles', ttDownloadables: { 'webvtt-lssdh-ios8': { downloadUrls: { a: 'https://cdn.example/sub.vtt' } } } },
          { language: 'en', rawTrackType: 'subtitles', isForcedNarrative: true, ttDownloadables: { 'webvtt-lssdh-ios8': { downloadUrls: { a: 'https://cdn.example/forced.vtt' } } } },
          { language: 'en', isNoneTrack: true, ttDownloadables: { 'webvtt-lssdh-ios8': { downloadUrls: { a: 'https://cdn.example/none.vtt' } } } },
        ],
      },
    };

    const selected = selectNetflixSubtitleTracks(manifest, 'en');

    expect(selected).toHaveLength(3);
    expect(selected[0]).toMatchObject({ language: 'en-US', rawTrackType: 'subtitles' });
    expect(selected[1]).toMatchObject({ language: 'en', rawTrackType: 'closedcaptions' });
  });

  it('extracts preferred WebVTT downloads and falls back to other formats', () => {
    const webvttManifest = {
      timedtexttracks: [{
        language: 'en',
        rawTrackType: 'subtitles',
        ttDownloadables: {
          'webvtt-lssdh-ios8': {
            downloadUrls: {
              primary: 'https://cdn.example/sub-a.vtt',
              backup: 'https://cdn.example/sub-b.vtt',
            },
          },
        },
      }],
    };
    const fallbackManifest = {
      timedtexttracks: [{
        language: 'en',
        rawTrackType: 'subtitles',
        ttDownloadables: {
          'imsc1.1': { downloadUrls: { primary: 'https://cdn.example/sub.xml' } },
        },
      }],
    };

    expect(extractNetflixSubtitleDownloads(webvttManifest, 'en')).toEqual([
      { url: 'https://cdn.example/sub-a.vtt', language: 'en', format: 'webvtt-lssdh-ios8', trackType: 'subtitles' },
      { url: 'https://cdn.example/sub-b.vtt', language: 'en', format: 'webvtt-lssdh-ios8', trackType: 'subtitles' },
    ]);
    expect(extractNetflixSubtitleDownloads(fallbackManifest, 'en')).toEqual([
      { url: 'https://cdn.example/sub.xml', language: 'en', format: 'imsc1.1', trackType: 'subtitles' },
    ]);
  });

  it('parses Netflix TTML tick and clock timings', () => {
    const xml = `
      <tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:tickRate="1000">
        <body>
          <div>
            <p begin="1500t" end="3200t">Hello<br/>world &amp; friends</p>
            <p begin="00:00:04.250" end="00:00:05.000"><span>Clock time</span></p>
          </div>
        </body>
      </tt>
    `;

    const cues = parseNetflixTTML(xml);

    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({
      index: 0,
      startMs: 1500,
      endMs: 3200,
      text: 'Hello\nworld & friends',
    });
    expect(cues[1]).toMatchObject({
      index: 1,
      startMs: 4250,
      endMs: 5000,
      text: 'Clock time',
    });
  });

  it('fetches and combines Netflix subtitle downloads from a manifest', async () => {
    const manifest = {
      timedtexttracks: [{
        language: 'en',
        rawTrackType: 'subtitles',
        ttDownloadables: {
          'webvtt-lssdh-ios8': {
            downloadUrls: {
              a: 'https://cdn.example/a.vtt',
              b: 'https://cdn.example/b.vtt',
            },
          },
        },
      }],
    };
    const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/a.vtt')) {
        return new Response(`WEBVTT

00:00:01.000 --> 00:00:02.000
First line

00:00:03.000 --> 00:00:04.000
Second line
`);
      }
      return new Response(`WEBVTT

00:00:01.000 --> 00:00:02.000
First line

00:00:05.000 --> 00:00:06.000
Third line
`);
    }) as unknown as typeof fetch;

    const cues = await fetchNetflixSubtitlesFromManifest(manifest, {
      preferredLang: 'en',
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledWith('https://cdn.example/a.vtt', { credentials: 'omit' });
    expect(cues.map(cue => cue.text)).toEqual(['First line', 'Second line', 'Third line']);
    expect(cues.map(cue => cue.index)).toEqual([0, 1, 2]);
  });
});
