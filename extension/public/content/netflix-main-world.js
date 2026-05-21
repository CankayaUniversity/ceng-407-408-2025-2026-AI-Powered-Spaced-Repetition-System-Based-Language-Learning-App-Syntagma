(function () {
  'use strict';

  if (window.__SYNTAGMA_NETFLIX_MAIN_WORLD__) return;
  window.__SYNTAGMA_NETFLIX_MAIN_WORLD__ = true;

  var WEBVTT_PROFILE = 'webvtt-lssdh-ios8';
  var MANIFEST_EVENT = 'syntagma:netflix-manifest';
  var REQUEST_EVENT = 'syntagma:request-subtitles';
  var UNAVAILABLE_EVENT = 'syntagma:netflix-subtitles-unavailable';
  var MANIFEST_CACHE_ID = 'syntagma-netflix-manifest-cache';
  var latestManifest = null;

  function getTracks(payload) {
    if (!payload || typeof payload !== 'object') return null;
    var result = payload.result && typeof payload.result === 'object' ? payload.result : null;
    return payload.timedtexttracks ||
      payload.timedtextTracks ||
      (result && (result.timedtexttracks || result.timedtextTracks)) ||
      null;
  }

  function manifestPayload(payload) {
    if (!getTracks(payload)) return null;
    return payload.result && getTracks(payload.result) ? payload.result : payload;
  }

  function ensureProfile(data) {
    try {
      var profiles = data && data.params && data.params.profiles;
      if (!Array.isArray(profiles)) return;
      if (profiles.indexOf(WEBVTT_PROFILE) === -1) profiles.unshift(WEBVTT_PROFILE);
    } catch (e) {
      // Ignore non-Netflix stringify payloads.
    }
  }

  function cacheManifest(json) {
    try {
      var cacheEl = document.getElementById(MANIFEST_CACHE_ID);
      if (!cacheEl) {
        cacheEl = document.createElement('div');
        cacheEl.id = MANIFEST_CACHE_ID;
        cacheEl.style.display = 'none';
        (document.documentElement || document.body).appendChild(cacheEl);
      }
      cacheEl.setAttribute('data-manifest', json);
    } catch (e) {
      // DOM may not be ready at the earliest document_start moment.
    }
  }

  function dispatchManifest(payload) {
    var manifest = manifestPayload(payload);
    if (!manifest) return;
    try {
      var json = JSON.stringify(manifest);
      latestManifest = json;
      cacheManifest(json);
      window.dispatchEvent(new CustomEvent(MANIFEST_EVENT, {
        detail: { manifestJson: json },
      }));
    } catch (e) {
      // Ignore manifests that cannot be serialized.
    }
  }

  function seekNetflixPlayer(timeMs) {
    var apiFns = [
      function () {
        var vp = window.netflix.appContext.state.playerApp.getAPI().videoPlayer;
        vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]).seek(timeMs);
      },
      function () {
        var vp = window.netflix.appContext.getState().playerApp.getAPI().videoPlayer;
        vp.getVideoPlayerBySessionId(vp.getAllPlayerSessionIds()[0]).seek(timeMs);
      },
      function () {
        window.netflix.player.seek(timeMs);
      },
    ];

    for (var i = 0; i < apiFns.length; i++) {
      try {
        apiFns[i]();
        return true;
      } catch (e) {
        // Try the next Netflix player API shape.
      }
    }
    return false;
  }

  var nativeParse = JSON.parse;
  var nativeStringify = JSON.stringify;

  JSON.parse = function (text, reviver) {
    var data = nativeParse.apply(this, arguments);
    dispatchManifest(data);
    return data;
  };

  JSON.stringify = function (data, replacer, space) {
    ensureProfile(data);
    return nativeStringify.apply(this, arguments);
  };

  window.addEventListener(REQUEST_EVENT, function () {
    if (latestManifest) {
      window.dispatchEvent(new CustomEvent(MANIFEST_EVENT, {
        detail: { manifestJson: latestManifest },
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent(UNAVAILABLE_EVENT));
  });

  window.addEventListener('syntagma:netflix-seek', function (event) {
    var timeMs = event && event.detail ? event.detail.timeMs : undefined;
    if (typeof timeMs !== 'number') return;
    if (!seekNetflixPlayer(timeMs)) {
      console.warn('[Syntagma] Netflix seek: no working API path found for seek to ' + timeMs + 'ms');
    }
  });
})();
