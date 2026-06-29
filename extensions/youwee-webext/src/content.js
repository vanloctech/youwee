(() => {
  const ext = globalThis.YouweeExt;
  if (!ext) return;

  const api = ext.getExtensionApi();
  const ROOT_ID = 'youwee-floating-root';
  const STORAGE_KEY = 'youwee-floating-prefs-v1';

  const defaultPrefs = {
    enabled: true,
    collapsedByHost: {},
  };

  let prefs = { ...defaultPrefs };
  let currentHost = ext.normalizeHost(location.hostname);
  let lastLocation = location.href;

  let root = null;
  let panel = null;
  let mediaVideoBtn = null;
  let mediaAudioBtn = null;
  let qualitySelect = null;
  let feedbackEl = null;

  let openState = false;
  let collapsedState = false;
  let mediaMode = 'video';

  const ACTION_ICONS = {
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>',
    queue:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h10"></path><path d="M4 12h10"></path><path d="M4 17h7"></path><path d="M18 10v8"></path><path d="M14 14h8"></path></svg>',
    summary:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"></path><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"></path></svg>',
  };
  const CONTROL_ICONS = {
    collapse:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 12h12"></path></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
  };

  function isTrustedUserEvent(event) {
    return !!event?.isTrusted;
  }

  function normalizePrefs(raw) {
    if (!raw || typeof raw !== 'object') {
      return { ...defaultPrefs };
    }

    return {
      enabled: raw.enabled !== false,
      collapsedByHost:
        raw.collapsedByHost && typeof raw.collapsedByHost === 'object' ? raw.collapsedByHost : {},
    };
  }

  function storageGet(key) {
    const storage = api?.storage?.local;
    if (!storage) return Promise.resolve({});

    try {
      const maybePromise = storage.get(key);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return maybePromise;
      }
    } catch {
      // Fallback to callback style.
    }

    return new Promise((resolve, reject) => {
      storage.get(key, (result) => {
        const error = api?.runtime?.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve(result || {});
      });
    });
  }

  function storageSet(payload) {
    const storage = api?.storage?.local;
    if (!storage) return Promise.resolve();

    try {
      const maybePromise = storage.set(payload);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return maybePromise;
      }
    } catch {
      // Fallback to callback style.
    }

    return new Promise((resolve, reject) => {
      storage.set(payload, () => {
        const error = api?.runtime?.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }
        resolve();
      });
    });
  }

  async function loadPrefs() {
    try {
      const result = await storageGet(STORAGE_KEY);
      prefs = normalizePrefs(result?.[STORAGE_KEY]);
    } catch {
      prefs = { ...defaultPrefs };
    }
  }

  function persistPrefs() {
    return storageSet({ [STORAGE_KEY]: prefs }).catch(() => {
      // Ignore storage failures in content script.
    });
  }

  function isEnabled() {
    return prefs.enabled !== false;
  }

  function getCollapsedForHost() {
    return prefs.collapsedByHost?.[currentHost] === true;
  }

  function setCollapsedForHost(nextValue) {
    prefs.collapsedByHost[currentHost] = !!nextValue;
    void persistPrefs();
  }

  function setEnabled(nextValue) {
    prefs.enabled = !!nextValue;
    void persistPrefs();
  }

  function shouldShowWidget() {
    return ext.isAllowlistedUrl(location.href) && isEnabled();
  }

  function getMediaValue() {
    return mediaMode === 'audio' ? 'audio' : 'video';
  }

  function getQualityValue() {
    const media = getMediaValue();
    return ext.normalizeQuality(media, qualitySelect?.value || '');
  }

  function getQualityOptions(media) {
    if (media === 'audio') {
      return [
        { value: 'auto', label: ext.t('floatingQualityAudioAuto', 'Audio Auto') },
        { value: '128', label: ext.t('floatingQualityAudio128', 'Audio 128 kbps') },
      ];
    }

    return [
      { value: 'best', label: ext.t('floatingQualityBest', 'Best') },
      { value: '8k', label: '8K (4320p)' },
      { value: '4k', label: '4K (2160p)' },
      { value: '2k', label: '2K (1440p)' },
      { value: '1080', label: '1080p' },
      { value: '720', label: '720p' },
      { value: '480', label: '480p' },
      { value: '360', label: '360p' },
    ];
  }

  function setPanelOpen(open) {
    openState = open;
    if (!root || !panel) return;

    root.dataset.open = open ? 'true' : 'false';
    panel.hidden = !open;
  }

  function setCollapsedState(nextValue) {
    collapsedState = !!nextValue;

    if (root) {
      root.dataset.collapsed = collapsedState ? 'true' : 'false';
    }

    if (collapsedState) {
      setPanelOpen(false);
    }

    setCollapsedForHost(collapsedState);
  }

  function updateMediaToggleUi() {
    const isAudio = mediaMode === 'audio';
    if (mediaVideoBtn) {
      mediaVideoBtn.dataset.active = isAudio ? 'false' : 'true';
    }
    if (mediaAudioBtn) {
      mediaAudioBtn.dataset.active = isAudio ? 'true' : 'false';
    }
  }

  function syncQualityOptions() {
    if (!qualitySelect) return;

    const media = getMediaValue();
    const options = getQualityOptions(media);
    const normalizedCurrent = ext.normalizeQuality(media, qualitySelect.value);

    qualitySelect.innerHTML = '';
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      qualitySelect.appendChild(item);
    }

    qualitySelect.value = options.some((item) => item.value === normalizedCurrent)
      ? normalizedCurrent
      : options[0].value;
  }

  function setMediaValue(nextMedia, skipQualitySync = false) {
    mediaMode = ext.normalizeMedia(nextMedia);
    updateMediaToggleUi();

    if (!skipQualitySync) {
      syncQualityOptions();
    }
  }

  function setFeedback(message, tone) {
    if (!feedbackEl) return;

    feedbackEl.textContent = message;
    feedbackEl.dataset.state = tone || '';

    window.setTimeout(() => {
      if (!feedbackEl?.isConnected) return;
      feedbackEl.textContent = '';
      feedbackEl.dataset.state = '';
    }, 1800);
  }

  function getCurrentOptions(action) {
    return {
      action: ext.normalizeAction(action),
      media: ext.normalizeMedia(getMediaValue()),
      quality: getQualityValue(),
    };
  }

  function openDeepLink(action, sourceUrl) {
    if (action === 'summary') {
      try {
        ext.openSummaryDeepLink(sourceUrl || location.href);
        return { ok: true, options: { action } };
      } catch (error) {
        return { ok: false, error };
      }
    }

    const options = getCurrentOptions(action);

    try {
      ext.openDeepLink(sourceUrl || location.href, undefined, options);
      return { ok: true, options };
    } catch (error) {
      return { ok: false, error };
    }
  }

  function onActionClick(action) {
    const result = openDeepLink(action, location.href);
    if (!result.ok) {
      setFeedback(ext.t('floatingButtonFailed', 'Failed to open Youwee'), 'error');
      return;
    }

    if (action === 'queue_only') {
      setFeedback(ext.t('floatingButtonQueueSent', 'Sent to queue'), 'ok');
      return;
    }

    if (action === 'summary') {
      setFeedback(ext.t('floatingButtonSummaryOpening', 'Opening summary...'), 'ok');
      return;
    }

    setFeedback(ext.t('floatingButtonOpening', 'Opening Youwee...'), 'ok');
  }

  function disconnectWidget() {
    if (root) {
      root.remove();
      root = null;
    }

    panel = null;
    mediaVideoBtn = null;
    mediaAudioBtn = null;
    qualitySelect = null;
    feedbackEl = null;

    openState = false;
  }

  function onDocumentClick(event) {
    if (!openState || !root) return;

    const target = event.target;
    if (!(target instanceof Node)) return;
    if (root.contains(target)) return;

    setPanelOpen(false);
  }

  function onDocumentKeydown(event) {
    if (event.key !== 'Escape') return;
    if (!openState) return;
    setPanelOpen(false);
  }

  function getRuntimeAssetUrl(path) {
    try {
      return ext.getExtensionApi()?.runtime?.getURL?.(path) || '';
    } catch {
      return '';
    }
  }

  function createLogoMarkup(logoUrl) {
    if (logoUrl) {
      return `<img class="youwee-floating__logo-img" src="${logoUrl}" alt="Youwee" />`;
    }

    return '<span class="youwee-floating__logo-fallback" aria-hidden="true">Y</span>';
  }

  function buildWidget() {
    const logoMarkup = createLogoMarkup(getRuntimeAssetUrl('icons/logo-64.png'));
    const canSummarize = ext.isYouTubeUrl(location.href);

    const container = document.createElement('div');
    container.id = ROOT_ID;
    container.className = 'youwee-floating';
    container.dataset.open = 'false';
    container.dataset.collapsed = collapsedState ? 'true' : 'false';

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'youwee-floating__tab';
    tab.title = ext.t('floatingExpand', 'Expand');
    tab.innerHTML = logoMarkup;
    tab.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      setCollapsedState(false);
    });

    const launch = document.createElement('button');
    launch.type = 'button';
    launch.className = 'youwee-floating__launcher';
    launch.title = ext.t('floatingLauncher', 'Youwee');
    launch.innerHTML = `
      <span class="youwee-floating__logo">
        ${logoMarkup}
      </span>
      <span class="youwee-floating__text">${ext.t('floatingLauncher', 'Youwee')}</span>
      <span class="youwee-floating__chevron">▾</span>
    `;
    launch.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      setPanelOpen(!openState);
    });

    const dropdown = document.createElement('div');
    dropdown.className = 'youwee-floating__panel';
    dropdown.hidden = true;

    dropdown.innerHTML = `
      <div class="youwee-floating__title-row">
        <div class="youwee-floating__title">${ext.t('floatingMenuTitle', 'Download with Youwee')}</div>
        <div class="youwee-floating__title-actions">
          <button
            type="button"
            class="youwee-floating__tiny-btn"
            data-action="collapse"
            title="${ext.t('floatingCollapse', 'Collapse')}"
            aria-label="${ext.t('floatingCollapse', 'Collapse')}"
          >${CONTROL_ICONS.collapse}</button>
          <button
            type="button"
            class="youwee-floating__tiny-btn"
            data-action="disable"
            title="${ext.t('floatingDisable', 'Turn off floating button')}"
            aria-label="${ext.t('floatingDisable', 'Turn off floating button')}"
          >${CONTROL_ICONS.close}</button>
        </div>
      </div>
      <label class="youwee-floating__label">${ext.t('floatingMedia', 'Media')}</label>
      <div class="youwee-floating__toggle" role="group" aria-label="${ext.t('floatingMedia', 'Media')}">
        <button type="button" class="youwee-floating__toggle-btn" data-media="video">
          ${ext.t('floatingMediaVideo', 'Video')}
        </button>
        <button type="button" class="youwee-floating__toggle-btn" data-media="audio">
          ${ext.t('floatingMediaAudio', 'Audio')}
        </button>
      </div>
      <label class="youwee-floating__label" for="youwee-quality-select">${ext.t('floatingQuality', 'Quality')}</label>
      <select id="youwee-quality-select" class="youwee-floating__select"></select>
      <div class="youwee-floating__actions">
        <button type="button" class="youwee-floating__action youwee-floating__action--primary" data-action="download_now">
          ${ACTION_ICONS.download}<span>${ext.t('floatingButtonDownloadNow', 'Download now')}</span>
        </button>
        <button type="button" class="youwee-floating__action youwee-floating__action--secondary" data-action="queue_only">
          ${ACTION_ICONS.queue}<span>${ext.t('floatingButtonAddQueue', 'Add to queue')}</span>
        </button>
        <button
          type="button"
          class="youwee-floating__action youwee-floating__action--summary"
          data-action="summary"
          ${canSummarize ? '' : 'disabled'}
          title="${canSummarize ? '' : ext.t('floatingSummaryUnavailable', 'Summary is available for YouTube videos')}"
        >
          ${ACTION_ICONS.summary}<span>${ext.t('floatingButtonSummary', 'AI Summary')}</span>
        </button>
      </div>
      <div class="youwee-floating__feedback" aria-live="polite"></div>
    `;

    container.appendChild(tab);
    container.appendChild(launch);
    container.appendChild(dropdown);

    panel = dropdown;

    mediaVideoBtn = /** @type {HTMLButtonElement | null} */ (
      dropdown.querySelector('[data-media="video"]')
    );
    mediaAudioBtn = /** @type {HTMLButtonElement | null} */ (
      dropdown.querySelector('[data-media="audio"]')
    );
    qualitySelect = /** @type {HTMLSelectElement | null} */ (
      dropdown.querySelector('#youwee-quality-select')
    );
    feedbackEl = /** @type {HTMLElement | null} */ (
      dropdown.querySelector('.youwee-floating__feedback')
    );

    mediaVideoBtn?.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      setMediaValue('video');
    });
    mediaAudioBtn?.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      setMediaValue('audio');
    });

    dropdown.querySelector('[data-action="download_now"]')?.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      onActionClick('download_now');
    });

    dropdown.querySelector('[data-action="queue_only"]')?.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      onActionClick('queue_only');
    });

    dropdown.querySelector('[data-action="summary"]')?.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      onActionClick('summary');
    });

    dropdown.querySelector('[data-action="collapse"]')?.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      setCollapsedState(true);
    });

    dropdown.querySelector('[data-action="disable"]')?.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      setEnabled(false);
      disconnectWidget();
    });

    setMediaValue('video');
    return container;
  }

  function ensureWidget() {
    if (!shouldShowWidget()) {
      disconnectWidget();
      return;
    }

    if (root?.isConnected) {
      root.dataset.collapsed = collapsedState ? 'true' : 'false';
      return;
    }

    const existing = document.getElementById(ROOT_ID);
    if (existing) {
      existing.remove();
    }

    root = buildWidget();
    document.documentElement.appendChild(root);
  }

  function refreshByLocation() {
    if (lastLocation === location.href) return;

    lastLocation = location.href;

    const nextHost = ext.normalizeHost(location.hostname);
    if (nextHost !== currentHost) {
      currentHost = nextHost;
      collapsedState = getCollapsedForHost();
      setPanelOpen(false);
    }

    ensureWidget();
  }

  function handleStorageChanged(changes, areaName) {
    if (areaName !== 'local') return;
    if (!changes || !changes[STORAGE_KEY]) return;

    prefs = normalizePrefs(changes[STORAGE_KEY].newValue);
    collapsedState = getCollapsedForHost();

    if (!isEnabled()) {
      disconnectWidget();
      return;
    }

    ensureWidget();
  }

  function setupEvents() {
    document.addEventListener('click', onDocumentClick, { capture: true });
    document.addEventListener('keydown', onDocumentKeydown);

    window.addEventListener('popstate', refreshByLocation, { passive: true });
    window.addEventListener('hashchange', refreshByLocation, { passive: true });
    window.addEventListener('yt-navigate-finish', refreshByLocation);
    window.addEventListener('yt-page-data-updated', refreshByLocation);
    window.setInterval(refreshByLocation, 1200);

    if (api?.storage?.onChanged?.addListener) {
      api.storage.onChanged.addListener(handleStorageChanged);
    }
  }

  if (api?.runtime?.onMessage) {
    api.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender?.id && sender.id !== api.runtime.id) return false;

      if (message?.type === 'youwee:floating-status') {
        if (isEnabled()) {
          ensureWidget();
        }
        sendResponse?.({
          ok: true,
          allowlisted: ext.isAllowlistedUrl(location.href),
          enabled: isEnabled(),
          visible: !!root?.isConnected,
        });
        return false;
      }

      if (message?.type !== 'youwee:open-deep-link') return false;

      if (message.action === 'summary') {
        try {
          const targetUrl =
            typeof message.url === 'string' && message.url ? message.url : location.href;
          if (!ext.parseHttpUrl(targetUrl)) {
            sendResponse?.({ ok: false, error: 'Invalid URL' });
            return false;
          }
          ext.openSummaryDeepLink(targetUrl);
          sendResponse?.({ ok: true });
        } catch (error) {
          sendResponse?.({ ok: false, error: String(error) });
        }

        return false;
      }

      const options = {
        action: ext.normalizeAction(message.action),
        media: ext.normalizeMedia(message.media),
        quality: message.quality,
      };

      if (root && qualitySelect) {
        setMediaValue(options.media);
        qualitySelect.value = ext.normalizeQuality(options.media, options.quality);
      }

      try {
        const targetUrl =
          typeof message.url === 'string' && message.url ? message.url : location.href;
        if (!ext.parseHttpUrl(targetUrl)) {
          sendResponse?.({ ok: false, error: 'Invalid URL' });
          return false;
        }
        ext.openDeepLink(targetUrl, undefined, options);
        sendResponse?.({ ok: true });
      } catch (error) {
        sendResponse?.({ ok: false, error: String(error) });
      }

      return false;
    });
  }

  async function bootstrap() {
    await loadPrefs();
    currentHost = ext.normalizeHost(location.hostname);
    collapsedState = getCollapsedForHost();

    ensureWidget();
    setupEvents();
  }

  void bootstrap();
})();
