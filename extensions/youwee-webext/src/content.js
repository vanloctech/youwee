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

    qualitySelect.replaceChildren();
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

  function buildWidget() {
    const logoUrl = api?.runtime?.getURL?.('icons/logo-64.png') || '';
    const launcherLabel = ext.t('floatingLauncher', 'Youwee');

    const container = document.createElement('div');
    container.id = ROOT_ID;
    container.className = 'youwee-floating';
    container.dataset.open = 'false';
    container.dataset.collapsed = collapsedState ? 'true' : 'false';

    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'youwee-floating__tab';
    tab.title = ext.t('floatingExpand', 'Expand');
    const tabLogo = document.createElement('img');
    tabLogo.className = 'youwee-floating__logo-img';
    tabLogo.src = logoUrl;
    tabLogo.alt = 'Youwee';
    tab.append(tabLogo);
    tab.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      setCollapsedState(false);
    });

    const launch = document.createElement('button');
    launch.type = 'button';
    launch.className = 'youwee-floating__launcher';
    launch.title = launcherLabel;
    const launchLogoWrap = document.createElement('span');
    launchLogoWrap.className = 'youwee-floating__logo';
    const launchLogo = document.createElement('img');
    launchLogo.className = 'youwee-floating__logo-img';
    launchLogo.src = logoUrl;
    launchLogo.alt = 'Youwee';
    launchLogoWrap.append(launchLogo);
    const launchText = document.createElement('span');
    launchText.className = 'youwee-floating__text';
    launchText.textContent = launcherLabel;
    const launchChevron = document.createElement('span');
    launchChevron.className = 'youwee-floating__chevron';
    launchChevron.textContent = '▾';
    launch.append(launchLogoWrap, launchText, launchChevron);
    launch.addEventListener('click', (event) => {
      if (!isTrustedUserEvent(event)) return;
      setPanelOpen(!openState);
    });

    const dropdown = document.createElement('div');
    dropdown.className = 'youwee-floating__panel';
    dropdown.hidden = true;

    const titleRow = document.createElement('div');
    titleRow.className = 'youwee-floating__title-row';

    const title = document.createElement('div');
    title.className = 'youwee-floating__title';
    title.textContent = ext.t('floatingMenuTitle', 'Download with Youwee');

    const titleActions = document.createElement('div');
    titleActions.className = 'youwee-floating__title-actions';

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'youwee-floating__tiny-btn';
    collapseBtn.dataset.action = 'collapse';
    collapseBtn.title = ext.t('floatingCollapse', 'Collapse');
    collapseBtn.setAttribute('aria-label', ext.t('floatingCollapse', 'Collapse'));
    collapseBtn.textContent = '—';

    const disableBtn = document.createElement('button');
    disableBtn.type = 'button';
    disableBtn.className = 'youwee-floating__tiny-btn';
    disableBtn.dataset.action = 'disable';
    disableBtn.title = ext.t('floatingDisable', 'Turn off floating button');
    disableBtn.setAttribute('aria-label', ext.t('floatingDisable', 'Turn off floating button'));
    disableBtn.textContent = '×';

    titleActions.append(collapseBtn, disableBtn);
    titleRow.append(title, titleActions);

    const mediaLabel = document.createElement('label');
    mediaLabel.className = 'youwee-floating__label';
    mediaLabel.textContent = ext.t('floatingMedia', 'Media');

    const mediaToggle = document.createElement('div');
    mediaToggle.className = 'youwee-floating__toggle';
    mediaToggle.setAttribute('role', 'group');
    mediaToggle.setAttribute('aria-label', ext.t('floatingMedia', 'Media'));

    const mediaVideoButton = document.createElement('button');
    mediaVideoButton.type = 'button';
    mediaVideoButton.className = 'youwee-floating__toggle-btn';
    mediaVideoButton.dataset.media = 'video';
    mediaVideoButton.textContent = ext.t('floatingMediaVideo', 'Video');

    const mediaAudioButton = document.createElement('button');
    mediaAudioButton.type = 'button';
    mediaAudioButton.className = 'youwee-floating__toggle-btn';
    mediaAudioButton.dataset.media = 'audio';
    mediaAudioButton.textContent = ext.t('floatingMediaAudio', 'Audio');

    mediaToggle.append(mediaVideoButton, mediaAudioButton);

    const qualityLabel = document.createElement('label');
    qualityLabel.className = 'youwee-floating__label';
    qualityLabel.htmlFor = 'youwee-quality-select';
    qualityLabel.textContent = ext.t('floatingQuality', 'Quality');

    const select = document.createElement('select');
    select.id = 'youwee-quality-select';
    select.className = 'youwee-floating__select';

    const actions = document.createElement('div');
    actions.className = 'youwee-floating__actions';

    const downloadNowBtn = document.createElement('button');
    downloadNowBtn.type = 'button';
    downloadNowBtn.className = 'youwee-floating__action youwee-floating__action--primary';
    downloadNowBtn.dataset.action = 'download_now';
    downloadNowBtn.textContent = ext.t('floatingButtonDownloadNow', 'Download now');

    const queueOnlyBtn = document.createElement('button');
    queueOnlyBtn.type = 'button';
    queueOnlyBtn.className = 'youwee-floating__action youwee-floating__action--secondary';
    queueOnlyBtn.dataset.action = 'queue_only';
    queueOnlyBtn.textContent = ext.t('floatingButtonAddQueue', 'Add to queue');

    actions.append(downloadNowBtn, queueOnlyBtn);

    const feedback = document.createElement('div');
    feedback.className = 'youwee-floating__feedback';
    feedback.setAttribute('aria-live', 'polite');

    dropdown.append(titleRow, mediaLabel, mediaToggle, qualityLabel, select, actions, feedback);

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
      if (message?.type !== 'youwee:open-deep-link') return false;

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
