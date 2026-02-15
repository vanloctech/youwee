(() => {
  const ALLOWLIST_HOSTS = [
    'youtube.com',
    'youtu.be',
    'music.youtube.com',
    'tiktok.com',
    'instagram.com',
    'facebook.com',
    'fb.watch',
    'x.com',
    'twitter.com',
    'vimeo.com',
    'twitch.tv',
    'clips.twitch.tv',
    'bilibili.com',
    'b23.tv',
    'dailymotion.com',
    'dai.ly',
    'soundcloud.com',
  ];

  const PLAYER_SELECTOR_RULES = [
    {
      host: 'youtube.com',
      selectors: ['#movie_player', 'ytd-player', '#player', '.html5-video-player', 'video'],
    },
    { host: 'youtu.be', selectors: ['video'] },
    {
      host: 'tiktok.com',
      selectors: ['[data-e2e="video-player"]', '[data-e2e="feed-video"]', 'video'],
    },
    {
      host: 'instagram.com',
      selectors: ['article video', '[role="dialog"] video', 'video'],
    },
    {
      host: 'facebook.com',
      selectors: ['div[data-pagelet="TahoeVideo"]', 'video'],
    },
    { host: 'fb.watch', selectors: ['video'] },
    { host: 'x.com', selectors: ['[data-testid="videoPlayer"]', 'video'] },
    { host: 'twitter.com', selectors: ['[data-testid="videoPlayer"]', 'video'] },
    {
      host: 'vimeo.com',
      selectors: [
        '.vp-video-wrapper video',
        '.player video',
        'video',
        'iframe[src*="player.vimeo.com"]',
      ],
    },
    { host: 'twitch.tv', selectors: ['video', '.video-player'] },
    { host: 'clips.twitch.tv', selectors: ['video', '.video-player'] },
    { host: 'bilibili.com', selectors: ['.bpx-player-container', 'video'] },
    { host: 'b23.tv', selectors: ['video'] },
    { host: 'dailymotion.com', selectors: ['.dmp_VideoView', 'video'] },
    { host: 'dai.ly', selectors: ['video'] },
    { host: 'soundcloud.com', selectors: ['.playbackSoundBadge', '.waveform', 'audio'] },
  ];

  const YOUTUBE_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
  ]);

  const RELEASE_URL = 'https://github.com/vanloctech/youwee/releases/latest';

  function normalizeHost(hostname) {
    return String(hostname || '')
      .toLowerCase()
      .replace(/^www\./, '');
  }

  function hostMatches(hostname, allowlistHost) {
    const normalizedHost = normalizeHost(hostname);
    const normalizedAllowlistHost = normalizeHost(allowlistHost);
    return (
      normalizedHost === normalizedAllowlistHost ||
      normalizedHost.endsWith(`.${normalizedAllowlistHost}`)
    );
  }

  function parseHttpUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  function isYouTubeUrl(rawUrl) {
    const parsed = parseHttpUrl(rawUrl);
    if (!parsed) return false;
    return YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase());
  }

  function isAllowlistedUrl(rawUrl) {
    const parsed = parseHttpUrl(rawUrl);
    if (!parsed) return false;
    const host = parsed.hostname.toLowerCase();
    return ALLOWLIST_HOSTS.some((allowlistHost) => hostMatches(host, allowlistHost));
  }

  function normalizeVideoUrl(rawUrl) {
    const parsed = parseHttpUrl(rawUrl);
    if (!parsed) return rawUrl;

    const host = parsed.hostname.toLowerCase();
    if (YOUTUBE_HOSTS.has(host)) {
      const hasVideoId = parsed.searchParams.has('v') || host === 'youtu.be';
      if (hasVideoId) {
        parsed.searchParams.delete('list');
        parsed.searchParams.delete('index');
      }
    }

    return parsed.toString();
  }

  function resolveTarget(rawUrl) {
    return isYouTubeUrl(rawUrl) ? 'youtube' : 'universal';
  }

  function detectSourceLabel() {
    return navigator.userAgent.toLowerCase().includes('firefox') ? 'ext-firefox' : 'ext-chromium';
  }

  function normalizeAction(action) {
    return action === 'queue_only' ? 'queue_only' : 'download_now';
  }

  function normalizeMedia(media) {
    return media === 'audio' ? 'audio' : 'video';
  }

  function normalizeQuality(media, quality) {
    const normalizedMedia = normalizeMedia(media);
    if (normalizedMedia === 'audio') {
      return quality === '128' ? '128' : 'auto';
    }
    const allowedVideo = new Set(['best', '8k', '4k', '2k', '1080', '720', '480', '360']);
    return allowedVideo.has(quality) ? quality : 'best';
  }

  function getPlayerSelectors(hostname) {
    const host = normalizeHost(hostname);
    const merged = [];

    for (const rule of PLAYER_SELECTOR_RULES) {
      if (!hostMatches(host, rule.host)) continue;
      for (const selector of rule.selectors) {
        if (!merged.includes(selector)) {
          merged.push(selector);
        }
      }
    }

    if (!merged.length) {
      merged.push('video');
    }

    return merged;
  }

  function isVisibleElement(element) {
    if (!(element instanceof HTMLElement)) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 80) return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }

    return true;
  }

  function resolvePlayerElement(rawUrl) {
    if (typeof document === 'undefined') return null;

    const parsed = parseHttpUrl(rawUrl || location.href);
    if (!parsed) return null;

    const selectors = getPlayerSelectors(parsed.hostname);
    let bestElement = null;
    let bestArea = 0;

    for (const selector of selectors) {
      let candidates = [];
      try {
        candidates = Array.from(document.querySelectorAll(selector));
      } catch {
        continue;
      }

      for (const candidate of candidates) {
        if (!isVisibleElement(candidate)) continue;
        const rect = candidate.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          bestElement = candidate;
        }
      }
    }

    return bestElement;
  }

  function computePlayerDockPosition(playerRect, widgetRect, viewport) {
    const safe = 12;
    const viewportWidth = Math.max(0, Number(viewport?.width || window.innerWidth));
    const viewportHeight = Math.max(0, Number(viewport?.height || window.innerHeight));
    const widgetWidth = Math.max(0, Number(widgetRect?.width || 180));
    const widgetHeight = Math.max(0, Number(widgetRect?.height || 42));

    const roomRight = viewportWidth - playerRect.right;
    const roomLeft = playerRect.left;
    const roomBottom = viewportHeight - playerRect.bottom;

    let x;
    let y;

    if (roomRight >= widgetWidth + safe * 2) {
      x = playerRect.right + safe;
      y = playerRect.top;
    } else if (roomLeft >= widgetWidth + safe * 2) {
      x = playerRect.left - widgetWidth - safe;
      y = playerRect.top;
    } else if (roomBottom >= widgetHeight + safe * 2) {
      x = playerRect.right - widgetWidth;
      y = playerRect.bottom + safe;
    } else {
      x = playerRect.right - widgetWidth;
      y = playerRect.top + safe;
    }

    const maxX = Math.max(safe, viewportWidth - widgetWidth - safe);
    const maxY = Math.max(safe, viewportHeight - widgetHeight - safe);

    return {
      x: Math.min(maxX, Math.max(safe, x)),
      y: Math.min(maxY, Math.max(safe, y)),
    };
  }

  function buildDeepLink(rawUrl, sourceLabel, options = {}) {
    const normalizedUrl = normalizeVideoUrl(rawUrl);
    const target = resolveTarget(normalizedUrl);
    const normalizedAction = normalizeAction(options.action);
    const normalizedMedia = normalizeMedia(options.media);
    const normalizedQuality = normalizeQuality(normalizedMedia, options.quality);
    const source = sourceLabel || detectSourceLabel();
    return `youwee://download?v=1&url=${encodeURIComponent(
      normalizedUrl,
    )}&target=${encodeURIComponent(target)}&action=${encodeURIComponent(
      normalizedAction,
    )}&media=${encodeURIComponent(normalizedMedia)}&quality=${encodeURIComponent(
      normalizedQuality,
    )}&source=${encodeURIComponent(source)}`;
  }

  function openDeepLink(rawUrl, sourceLabel, options = {}) {
    const deepLink = buildDeepLink(rawUrl, sourceLabel, options);
    const anchor = document.createElement('a');
    anchor.href = deepLink;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.documentElement.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return deepLink;
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.focus();
    temp.select();
    document.execCommand('copy');
    temp.remove();
  }

  function getExtensionApi() {
    return globalThis.browser || globalThis.chrome || null;
  }

  function t(key, fallback) {
    const api = getExtensionApi();
    const value = api?.i18n?.getMessage?.(key);
    return value || fallback || key;
  }

  globalThis.YouweeExt = {
    ALLOWLIST_HOSTS,
    RELEASE_URL,
    parseHttpUrl,
    isYouTubeUrl,
    isAllowlistedUrl,
    normalizeHost,
    normalizeVideoUrl,
    resolveTarget,
    normalizeAction,
    normalizeMedia,
    normalizeQuality,
    detectSourceLabel,
    resolvePlayerElement,
    computePlayerDockPosition,
    buildDeepLink,
    openDeepLink,
    copyToClipboard,
    getExtensionApi,
    t,
  };
})();
