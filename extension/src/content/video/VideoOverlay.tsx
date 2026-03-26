import { useState, useEffect, useRef, useCallback } from 'react';
import type { UserSettings, LexemeEntry, WordStatus, SubtitleCue } from '../../shared/types';
import { sendMessage } from '../../shared/messages';
import { SubtitleDisplay } from './SubtitleDisplay';
import { SettingsDrawer } from './SettingsDrawer';
import {
  captureYouTubeSubtitles,
  getYouTubeAvailableLanguages,
  observeYouTubeCaptions,
  observeNetflixCaptions,
  watchTextTracksForFullTranscript,
} from './subtitle-capture';
import type { VideoPlatform } from './video-detector';
import { mountWordPopup, dismissWordPopup } from '../popup/WordPopup';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Cue lookup helpers ───────────────────────────────────────────────────────

function findCueAt(cues: SubtitleCue[], ms: number, offsetMs: number): SubtitleCue | null {
  const t = ms - offsetMs;
  for (const cue of cues) {
    if (t >= cue.startMs && t < cue.endMs) return cue;
  }
  return null;
}

function findNextCue(cues: SubtitleCue[], ms: number, offsetMs: number): SubtitleCue | null {
  const t = ms - offsetMs;
  for (const cue of cues) {
    if (cue.startMs > t) return cue;
  }
  return null;
}

function isInAnyCue(cues: SubtitleCue[], ms: number, offsetMs: number): boolean {
  return findCueAt(cues, ms, offsetMs) !== null;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function storageKey(prefix: string): string {
  try {
    return `${prefix}_${btoa(encodeURIComponent(window.location.href)).slice(0, 32)}`;
  } catch {
    return `${prefix}_${window.location.href.slice(-32)}`;
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface VideoOverlayProps {
  video: HTMLVideoElement;
  platform: VideoPlatform;
  settings: UserSettings;
  lexemes: Record<string, LexemeEntry>;
  onStatusChange: (lemma: string, status: WordStatus) => void;
  onSettingsChange: (patch: Partial<UserSettings>) => void;
  onCuesChange?: (cues: SubtitleCue[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function VideoOverlay({
  video,
  platform,
  settings: externalSettings,
  lexemes: externalLexemes,
  onStatusChange,
  onSettingsChange,
  onCuesChange,
}: VideoOverlayProps) {
  const [settings, setSettings] = useState(externalSettings);
  const [lexemes, setLexemes] = useState(externalLexemes);

  const [targetCues, setTargetCues] = useState<SubtitleCue[]>([]);
  const [secondaryCues, setSecondaryCues] = useState<SubtitleCue[]>([]);
  const [targetSource, setTargetSource] = useState<'platform' | 'import' | 'none'>('none');
  const [secondarySource, setSecondarySource] = useState<'import' | 'none'>('none');

  const [currentTarget, setCurrentTarget] = useState<SubtitleCue | null>(null);
  const [currentSecondary, setCurrentSecondary] = useState<SubtitleCue | null>(null);
  const [liveCue, setLiveCue] = useState<SubtitleCue | null>(null);
  const [isPaused, setIsPaused] = useState(video.paused);
  const [showSettings, setShowSettings] = useState(false);
  const [captureStatus, setCaptureStatus] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle');

  const autoPauseRef = useRef({
    lastAfterIndex: -1,
    lastBeforeIndex: -1,
    prevCue: null as SubtitleCue | null,
    userJustPlayed: false,
  });
  const sceneSpeedRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setSettings(externalSettings), [externalSettings]);
  useEffect(() => setLexemes(externalLexemes), [externalLexemes]);

  // ── Platform subtitle init ─────────────────────────────────────────────────
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    const makeLiveCue = (text: string): SubtitleCue => ({
      index: 0, startMs: 0, endMs: Infinity,
      text, rawText: text, bookmarked: false, selected: false,
    });

    if (platform === 'youtube') {
      getYouTubeAvailableLanguages();
      setCaptureStatus('loading');

      // ── Full-transcript fetch (retries up to 15 s) ────────────────────
      captureYouTubeSubtitles('en', 15000).then(cues => {
        if (cues.length) {
          setTargetCues(cues);
          setTargetSource('platform');
          setCaptureStatus('ok');
        } else {
          setCaptureStatus('failed');
        }
      }).catch(() => setCaptureStatus('failed'));

      // ── Always also watch video.textTracks (catches: user enables CC
      //    after load, lazy-loaded ASR tracks, etc.) ────────────────────
      cleanups.push(
        watchTextTracksForFullTranscript(video, 'en', (cues) => {
          setTargetCues(prev => {
            if (cues.length > prev.length) {
              setTargetSource('platform');
              setCaptureStatus('ok');
              return cues;
            }
            return prev;
          });
        })
      );

      // ── Live DOM observer for word-by-word playback interaction ───────
      cleanups.push(
        observeYouTubeCaptions(
          text => setLiveCue(makeLiveCue(text)),
          () => setLiveCue(null),
        )
      );
    }

    if (platform === 'netflix') {
      cleanups.push(
        observeNetflixCaptions(
          video,
          text => setLiveCue(makeLiveCue(text)),
          () => setLiveCue(null),
          (allCues) => {
            setTargetCues(prev => allCues.length > prev.length ? allCues : prev);
          },
        )
      );
      setTargetSource('platform');
    }

    // ── Manual retry via custom event (sidebar "Retry" button) ────────
    const handleRetry = () => {
      setCaptureStatus('loading');
      setTargetCues([]);
      captureYouTubeSubtitles('en', 10000).then(cues => {
        if (cues.length) {
          setTargetCues(cues);
          setTargetSource('platform');
          setCaptureStatus('ok');
        } else {
          setCaptureStatus('failed');
        }
      }).catch(() => setCaptureStatus('failed'));
    };
    window.addEventListener('syntagma:retry-subtitle-capture', handleRetry);
    cleanups.push(() => window.removeEventListener('syntagma:retry-subtitle-capture', handleRetry));

    return () => cleanups.forEach(fn => fn());
  }, [platform, video]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify sidebar when cues change ───────────────────────────────────────
  useEffect(() => {
    if (targetCues.length > 0) onCuesChange?.(targetCues);
  }, [targetCues, onCuesChange]);

  // ── Listen for subtitle imports dispatched from the sidebar ───────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { cues, track } = (e as CustomEvent<{ cues: SubtitleCue[]; track: 'target' | 'secondary' }>).detail;
      if (track === 'target') handleTargetImport(cues, 'imported');
      else handleSecondaryImport(cues, 'imported');
    };
    window.addEventListener('syntagma:subtitle-import', handler);
    return () => window.removeEventListener('syntagma:subtitle-import', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hide platform native subtitles when our overlay is showing ────────────
  // Injected into document.head (not shadow root) so it pierces iframes too.
  const hasAnyTrack = targetCues.length > 0 || targetSource === 'platform';
  useEffect(() => {
    if (!hasAnyTrack) return;
    const style = document.createElement('style');
    style.id = 'syntagma-hide-native-subs';
    style.textContent = [
      // YouTube
      `.ytp-caption-window-container { visibility: hidden !important; }`,
      // Netflix
      `.player-timedtext, .nf-player-timedtext, [data-uia="player-timedtext"] { visibility: hidden !important; }`,
    ].join('\n');
    document.head.appendChild(style);
    return () => style.remove();
  }, [hasAnyTrack]);

  // ── Restore previously imported subtitles ─────────────────────────────────
  useEffect(() => {
    const tk = storageKey('syn_sub_target');
    const sk = storageKey('syn_sub_secondary');
    chrome.storage.local.get([tk, sk]).then(res => {
      if (res[tk] && Array.isArray(res[tk]) && targetSource === 'none') {
        setTargetCues(res[tk] as SubtitleCue[]);
        setTargetSource('import');
      }
      if (res[sk] && Array.isArray(res[sk])) {
        setSecondaryCues(res[sk] as SubtitleCue[]);
        setSecondarySource('import');
      }
    }).catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Word click handler ──────────────────────────────────────────────────────
  const handleWordClick = useCallback((
    lemma: string,
    surface: string,
    sentence: string,
    rect: DOMRect,
  ) => {
    const doOpen = () => {
      if (settings.pauseOnWordInteraction && !video.paused) video.pause();

      mountWordPopup({
        lemma, surface, sentence, anchorRect: rect,
        lexeme: lexemes[lemma] ?? null,
        settings,
        onClose: () => {
          dismissWordPopup();
          if (settings.resumeAfterInteraction) {
            if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
            resumeTimerRef.current = setTimeout(() => {
              video.play().catch(() => {});
            }, settings.resumeDelayMs);
          }
        },
        onStatusChange: (l, status) => {
          const now = Date.now();
          setLexemes(prev => ({
            ...prev,
            [l]: {
              ...(prev[l] ?? { key: l, lemma: l, surface: l, type: 'word', seenCount: 1, lastSeenAt: now, createdAt: now }),
              status,
            },
          }));
          onStatusChange(l, status);
        },
      }, { zIndex: 2147483647 });
    };

    if (settings.interactionDelayMs > 0) {
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
      interactionTimerRef.current = setTimeout(doOpen, settings.interactionDelayMs);
    } else {
      doOpen();
    }
  }, [lexemes, settings, video, onStatusChange]);

  // ── Subtitle import handlers ────────────────────────────────────────────────
  const handleTargetImport = useCallback((cues: SubtitleCue[], _fileName: string) => {
    setTargetCues(cues);
    setTargetSource('import');
    onCuesChange?.(cues);
    chrome.storage.local.set({ [storageKey('syn_sub_target')]: cues }).catch(console.error);
  }, [onCuesChange]);

  const handleSecondaryImport = useCallback((cues: SubtitleCue[], _fileName: string) => {
    setSecondaryCues(cues);
    setSecondarySource('import');
    chrome.storage.local.set({ [storageKey('syn_sub_secondary')]: cues }).catch(console.error);
  }, []);

  // ── Setting change ─────────────────────────────────────────────────────────
  const handleSettingChange = useCallback(<K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    onSettingsChange({ [key]: value });
  }, [onSettingsChange]);

  // ── Play/pause tracking ────────────────────────────────────────────────────
  useEffect(() => {
    const onPause = () => {
      setIsPaused(true);
      if (settings.autoPauseMode === 'rewind-and-pause') {
        video.currentTime = Math.max(0, video.currentTime - 2);
      }
    };
    const onPlay = () => {
      setIsPaused(false);
      autoPauseRef.current.userJustPlayed = true;
      setTimeout(() => { autoPauseRef.current.userJustPlayed = false; }, 1500);
    };
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    return () => {
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
    };
  }, [video, settings.autoPauseMode]);

  // ── Core timeupdate loop ────────────────────────────────────────────────────
  useEffect(() => {
    const tOffset = settings.targetSubtitleOffsetMs;
    const sOffset = settings.secondarySubtitleOffsetMs;
    const tolerance = settings.autoPauseDelayToleranceMs;
    const ap = autoPauseRef.current;

    const onTimeUpdate = () => {
      const ms = video.currentTime * 1000;

      const newTarget = findCueAt(targetCues, ms, tOffset);
      const newSecondary = findCueAt(secondaryCues, ms, sOffset);
      setCurrentTarget(newTarget);
      setCurrentSecondary(newSecondary);

      // ── Scene skip ──────────────────────────────────────────────────────
      if (settings.sceneSkipMode !== 'off' && targetCues.length > 0) {
        const inCue = isInAnyCue(targetCues, ms, tOffset);
        if (!inCue) {
          const nextCue = findNextCue(targetCues, ms, tOffset);
          const adjustedMs = ms - tOffset;
          const prevEndMs = (() => {
            for (let i = targetCues.length - 1; i >= 0; i--) {
              if (targetCues[i].endMs <= adjustedMs) return targetCues[i].endMs;
            }
            return 0;
          })();
          const gapMs = (nextCue ? nextCue.startMs : Infinity) - prevEndMs;
          if (gapMs > 3000) {
            if (settings.sceneSkipMode === 'jump') {
              if (nextCue) video.currentTime = (nextCue.startMs + tOffset) / 1000;
            } else if (!sceneSpeedRef.current) {
              video.playbackRate = parseInt(settings.sceneSkipMode, 10);
              sceneSpeedRef.current = true;
            }
          }
        } else if (sceneSpeedRef.current) {
          video.playbackRate = 1;
          sceneSpeedRef.current = false;
        }
      }

      // ── Auto-pause ──────────────────────────────────────────────────────
      if (settings.autoPauseMode === 'off' || ap.userJustPlayed || targetCues.length === 0) {
        ap.prevCue = newTarget;
        return;
      }
      const adjustedMs = ms - tOffset;

      if (settings.autoPauseMode === 'before' || settings.autoPauseMode === 'before-and-after') {
        const nextCue = findNextCue(targetCues, ms, tOffset);
        if (nextCue && !newTarget) {
          const msUntil = nextCue.startMs - adjustedMs;
          if (msUntil >= 0 && msUntil <= 350 && ap.lastBeforeIndex !== nextCue.index) {
            ap.lastBeforeIndex = nextCue.index;
            video.pause();
          }
        }
      }
      if (settings.autoPauseMode === 'after' || settings.autoPauseMode === 'before-and-after') {
        const prevCue = ap.prevCue;
        if (prevCue && !newTarget) {
          const endedWithinTolerance = adjustedMs <= prevCue.endMs + tolerance + 300;
          if (endedWithinTolerance && ap.lastAfterIndex !== prevCue.index) {
            ap.lastAfterIndex = prevCue.index;
            video.pause();
          }
        }
      }
      ap.prevCue = newTarget;
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [video, settings, targetCues, secondaryCues]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const displayTarget  = currentTarget ?? liveCue;
  const hasTargetTrack = targetCues.length > 0 || targetSource === 'platform';
  const hasSecondaryTrack = secondaryCues.length > 0;
  const hasAnySub = hasTargetTrack || hasSecondaryTrack;

  return (
    <div
      data-syntagma-video-overlay=""
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9999 }}
    >
      {/* ── Settings drawer ──────────────────────────────────────────────── */}
      {showSettings && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          right: '10px',
          pointerEvents: 'auto',
          zIndex: 10001,
        }}>
          <SettingsDrawer
            settings={settings}
            onSettingChange={handleSettingChange}
            onTargetImport={handleTargetImport}
            onSecondaryImport={handleSecondaryImport}
            targetTrackSource={targetSource}
            secondaryTrackSource={secondarySource}
          />
        </div>
      )}

      {/* ── Migaku-style subtitle bar ────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        pointerEvents: 'auto',
        zIndex: 10000,
        userSelect: 'none',
      }}>

        {/* Controls strip — always visible so user can access settings */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '3px 10px',
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          gap: '8px',
        }}>
          {/* Left: cue timing / status */}
          <span style={{
            fontSize: '10px',
            color: displayTarget ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.25)',
            fontVariantNumeric: 'tabular-nums',
            display: 'flex', alignItems: 'center', gap: '5px',
          }}>
            {captureStatus === 'loading' && !hasTargetTrack && (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  style={{ animation: 'syn-spin 1s linear infinite', flexShrink: 0 }}>
                  <path d="M12 2a10 10 0 0 1 10 10"/>
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/>
                </svg>
                <style>{`@keyframes syn-spin { to { transform: rotate(360deg); } }`}</style>
                Loading subtitles…
              </>
            )}
            {captureStatus === 'failed' && !hasTargetTrack && (
              <>
                <span style={{ color: 'rgba(217,119,98,0.7)' }}>No subtitles found.</span>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('syntagma:retry-subtitle-capture'))}
                  style={{
                    background: 'rgba(152,193,217,0.15)', border: '1px solid rgba(152,193,217,0.35)',
                    borderRadius: '3px', color: '#98C1D9', fontSize: '10px', fontWeight: 600,
                    padding: '1px 6px', cursor: 'pointer',
                  }}
                >↺ Retry</button>
              </>
            )}
            {(captureStatus === 'ok' || hasTargetTrack) && displayTarget && (
              `${formatTime(displayTarget.startMs)} → ${formatTime(displayTarget.endMs)}`
            )}
            {(captureStatus === 'ok' || hasTargetTrack) && !displayTarget && (
              <span style={{ opacity: 0.4 }}>—</span>
            )}
          </span>

          {/* Right: track badges + settings toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {targetSource !== 'none' && (
              <span style={{
                fontSize: '9px', fontWeight: 700,
                color: targetSource === 'import' ? '#98C1D9' : '#A8B693',
                background: targetSource === 'import' ? 'rgba(152,193,217,0.15)' : 'rgba(168,182,147,0.15)',
                border: `1px solid ${targetSource === 'import' ? 'rgba(152,193,217,0.3)' : 'rgba(168,182,147,0.3)'}`,
                padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.4px',
              }}>
                {targetSource === 'import' ? 'SRT' : 'YT'}
              </span>
            )}
            {secondarySource !== 'none' && (
              <span style={{
                fontSize: '9px', fontWeight: 700,
                color: '#A07855',
                background: 'rgba(160,120,85,0.15)',
                border: '1px solid rgba(160,120,85,0.3)',
                padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase', letterSpacing: '0.4px',
              }}>
                2nd
              </span>
            )}

            {/* Settings toggle */}
            <button
              onClick={() => setShowSettings(v => !v)}
              title="Subtitle settings"
              style={{
                background: showSettings ? 'rgba(160,120,85,0.35)' : 'rgba(255,255,255,0.08)',
                border: `1px solid ${showSettings ? 'rgba(160,120,85,0.6)' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '4px',
                color: showSettings ? '#C9A070' : 'rgba(255,255,255,0.55)',
                padding: '2px 7px',
                cursor: 'pointer',
                fontSize: '12px',
                lineHeight: 1.2,
                transition: 'all 0.15s',
              }}
            >
              ⚙
            </button>
          </div>
        </div>

        {/* Subtitle text area */}
        {hasAnySub && (
          <div style={{
            background: `rgba(0,0,0,${settings.subtitleOverlayOpacity})`,
            backdropFilter: 'blur(3px)',
            padding: '6px 5% 10px',
          }}>
            {/* Target subtitle */}
            {hasTargetTrack && (displayTarget ? (
              <div style={{ fontSize: `${settings.targetSubtitleSize}%` }}>
                <SubtitleDisplay
                  cue={displayTarget}
                  language="en"
                  obscureMode={settings.targetSubtitleObscure}
                  revealOnPause={settings.revealOnPause}
                  revealOnHover={settings.revealOnHover}
                  revealByKnownStatus={settings.revealByKnownStatus}
                  isPaused={isPaused}
                  lexemes={lexemes}
                  settings={settings}
                  fontSize={settings.targetSubtitleSize}
                  onWordClick={handleWordClick}
                />
              </div>
            ) : (
              /* Placeholder bar so the panel height stays consistent */
              <div style={{
                height: `${Math.max(settings.targetSubtitleSize * 0.28, 28)}px`,
                opacity: 0,
              }} />
            ))}

            {/* Secondary subtitle */}
            {hasSecondaryTrack && currentSecondary && (
              <div style={{ fontSize: `${settings.secondarySubtitleSize}%`, marginTop: '2px' }}>
                <SubtitleDisplay
                  cue={currentSecondary}
                  language="tr"
                  obscureMode={settings.secondarySubtitleObscure}
                  revealOnPause={settings.revealOnPause}
                  revealOnHover={settings.revealOnHover}
                  revealByKnownStatus={false}
                  isPaused={isPaused}
                  lexemes={lexemes}
                  settings={settings}
                  fontSize={settings.secondarySubtitleSize}
                  onWordClick={handleWordClick}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
