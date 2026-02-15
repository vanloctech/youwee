(() => {
  const ext = globalThis.YouweeExt;
  if (!ext) return;

  const api = ext.getExtensionApi();
  const STORAGE_KEY = 'youwee-floating-prefs-v1';
  let currentUrl = '';
  let activeTabId = null;
  const manifestVersion = api?.runtime?.getManifest?.()?.version || '0.0.0';
  let floatingPrefs = { enabled: true, collapsedByHost: {} };

  const titleEl = document.getElementById('title');
  const versionLinkEl = document.getElementById('versionLink');
  const urlLabelEl = document.getElementById('urlLabel');
  const urlValueEl = document.getElementById('urlValue');
  const copyUrlIconBtn = document.getElementById('copyUrlIconBtn');
  const floatingLabelEl = document.getElementById('floatingLabel');
  const floatingStateEl = document.getElementById('floatingState');
  const floatingToggleBtn = document.getElementById('floatingToggleBtn');
  const mediaLabelEl = document.getElementById('mediaLabel');
  const qualityLabelEl = document.getElementById('qualityLabel');
  const mediaVideoBtn = document.getElementById('mediaVideoBtn');
  const mediaAudioBtn = document.getElementById('mediaAudioBtn');
  const qualitySelect = document.getElementById('qualitySelect');
  const statusEl = document.getElementById('status');
  const madeWithPrefixEl = document.getElementById('madeWithPrefix');
  const madeWithByEl = document.getElementById('madeWithBy');
  const downloadBtn = document.getElementById('downloadBtn');
  const queueBtn = document.getElementById('queueBtn');
  let mediaMode = 'video';

  function queryTabs(query) {
    if (!api?.tabs?.query) return Promise.resolve([]);
    try {
      const maybePromise = api.tabs.query(query);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return maybePromise;
      }
    } catch {
      // Fallback to callback style.
    }
    return new Promise((resolve, reject) => {
      api.tabs.query(query, (tabs) => {
        const lastError = api.runtime?.lastError;
        if (lastError) reject(lastError);
        else resolve(tabs || []);
      });
    });
  }

  function sendMessageToTab(tabId, message) {
    if (!api?.tabs?.sendMessage) {
      return Promise.reject(new Error('sendMessage not available'));
    }

    try {
      const maybePromise = api.tabs.sendMessage(tabId, message);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return maybePromise;
      }
    } catch {
      // Fallback to callback-style.
    }

    return new Promise((resolve, reject) => {
      api.tabs.sendMessage(tabId, message, (response) => {
        const lastError = api.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function setStatus(text, tone) {
    if (!text) {
      statusEl.textContent = '';
      statusEl.className = 'status';
      statusEl.hidden = true;
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.className = `status${tone ? ` ${tone}` : ''}`;
  }

  function normalizeFloatingPrefs(raw) {
    if (!raw || typeof raw !== 'object') {
      return { enabled: true, collapsedByHost: {} };
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

  function isFloatingEnabled() {
    return floatingPrefs.enabled !== false;
  }

  function updateFloatingToggleUi() {
    const enabled = isFloatingEnabled();
    floatingToggleBtn.dataset.enabled = enabled ? 'true' : 'false';
    floatingStateEl.textContent = enabled
      ? t('popupFloatingEnabled', 'Enabled')
      : t('popupFloatingDisabled', 'Disabled');
    floatingToggleBtn.title = t('popupFloatingLabel', 'Floating button');
    floatingToggleBtn.setAttribute('aria-label', t('popupFloatingLabel', 'Floating button'));
  }

  async function loadFloatingPrefs() {
    try {
      const result = await storageGet(STORAGE_KEY);
      floatingPrefs = normalizeFloatingPrefs(result?.[STORAGE_KEY]);
    } catch {
      floatingPrefs = normalizeFloatingPrefs(null);
    }
  }

  function persistFloatingPrefs() {
    return storageSet({ [STORAGE_KEY]: floatingPrefs });
  }

  async function handleFloatingToggle() {
    floatingPrefs.enabled = !isFloatingEnabled();
    updateFloatingToggleUi();

    try {
      await persistFloatingPrefs();
      setStatus(
        floatingPrefs.enabled
          ? t('popupFloatingEnabled', 'Enabled')
          : t('popupFloatingDisabled', 'Disabled'),
        'ok',
      );
    } catch {
      floatingPrefs.enabled = !floatingPrefs.enabled;
      updateFloatingToggleUi();
      setStatus(
        t('popupFloatingToggleFailed', 'Failed to update floating button setting.'),
        'error',
      );
    }
  }

  function handleStorageChanged(changes, areaName) {
    if (areaName !== 'local') return;
    if (!changes || !changes[STORAGE_KEY]) return;
    floatingPrefs = normalizeFloatingPrefs(changes[STORAGE_KEY].newValue);
    updateFloatingToggleUi();
  }

  function t(key, fallback) {
    return ext.t(key, fallback);
  }

  function getMediaValue() {
    return mediaMode === 'audio' ? 'audio' : 'video';
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

  function setMediaValue(nextMedia, skipQualitySync = false) {
    mediaMode = ext.normalizeMedia(nextMedia);
    updateMediaToggleUi();
    if (!skipQualitySync) {
      syncQualityOptions();
    }
  }

  function getQualityOptions(media) {
    if (media === 'audio') {
      return [
        { value: 'auto', label: t('floatingQualityAudioAuto', 'Audio Auto') },
        { value: '128', label: t('floatingQualityAudio128', 'Audio 128 kbps') },
      ];
    }

    return [
      { value: 'best', label: t('floatingQualityBest', 'Best') },
      { value: '8k', label: '8K (4320p)' },
      { value: '4k', label: '4K (2160p)' },
      { value: '2k', label: '2K (1440p)' },
      { value: '1080', label: '1080p' },
      { value: '720', label: '720p' },
      { value: '480', label: '480p' },
      { value: '360', label: '360p' },
    ];
  }

  function syncQualityOptions() {
    const media = getMediaValue();
    const current = ext.normalizeQuality(media, qualitySelect?.value || '');
    const options = getQualityOptions(media);
    qualitySelect.innerHTML = '';
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option.value;
      item.textContent = option.label;
      qualitySelect.appendChild(item);
    }
    qualitySelect.value = options.some((item) => item.value === current)
      ? current
      : options[0].value;
  }

  function updateTexts() {
    document.title = t('extensionName', 'Youwee Downloader');
    titleEl.textContent = t('popupTitle', 'Download with Youwee');
    versionLinkEl.textContent = `v${manifestVersion}`;
    versionLinkEl.title = t('popupOpenRelease', 'Get / Update Youwee');
    urlLabelEl.textContent = t('popupCurrentUrl', 'Current URL');
    copyUrlIconBtn.title = t('popupCopyUrl', 'Copy URL');
    copyUrlIconBtn.setAttribute('aria-label', t('popupCopyUrl', 'Copy URL'));
    floatingLabelEl.textContent = t('popupFloatingLabel', 'Floating button');
    mediaLabelEl.textContent = t('floatingMedia', 'Media');
    qualityLabelEl.textContent = t('floatingQuality', 'Quality');
    if (mediaVideoBtn) mediaVideoBtn.textContent = t('floatingMediaVideo', 'Video');
    if (mediaAudioBtn) mediaAudioBtn.textContent = t('floatingMediaAudio', 'Audio');
    downloadBtn.textContent = t('popupPrimaryAction', 'Download now with Youwee');
    queueBtn.textContent = t('popupQueueAction', 'Add to queue in Youwee');
    madeWithPrefixEl.textContent = t('popupMadeWith', 'Made with');
    madeWithByEl.textContent = t('popupBy', 'by');
    updateFloatingToggleUi();
  }

  function updateUrlState(url) {
    const parsed = ext.parseHttpUrl(url);
    const isHttp = !!parsed;

    if (!isHttp) {
      urlValueEl.textContent = t('popupUrlUnavailable', 'No valid HTTP/HTTPS URL in current tab.');
      setStatus(t('popupStatusInvalid', 'This tab cannot be sent to Youwee.'), 'error');
      downloadBtn.disabled = true;
      queueBtn.disabled = true;
      copyUrlIconBtn.disabled = true;
      if (mediaVideoBtn) mediaVideoBtn.disabled = true;
      if (mediaAudioBtn) mediaAudioBtn.disabled = true;
      qualitySelect.disabled = true;
      return;
    }

    currentUrl = ext.normalizeVideoUrl(url);
    urlValueEl.textContent = currentUrl;
    downloadBtn.disabled = false;
    queueBtn.disabled = false;
    copyUrlIconBtn.disabled = false;
    if (mediaVideoBtn) mediaVideoBtn.disabled = false;
    if (mediaAudioBtn) mediaAudioBtn.disabled = false;
    qualitySelect.disabled = false;

    setStatus('', '');
  }

  async function handleDownloadClick(action = 'download_now') {
    if (!currentUrl) return;
    const options = {
      action,
      media: getMediaValue(),
      quality: ext.normalizeQuality(getMediaValue(), qualitySelect.value),
    };

    try {
      if (Number.isInteger(activeTabId)) {
        await sendMessageToTab(activeTabId, {
          type: 'youwee:open-deep-link',
          url: currentUrl,
          ...options,
        });
      } else {
        ext.openDeepLink(currentUrl, undefined, options);
      }
      setStatus(
        action === 'queue_only'
          ? t('popupStatusQueued', 'Sent to queue in Youwee.')
          : t('popupStatusOpening', 'Opening Youwee...'),
        'ok',
      );
    } catch {
      try {
        ext.openDeepLink(currentUrl, undefined, options);
        setStatus(
          action === 'queue_only'
            ? t('popupStatusQueued', 'Sent to queue in Youwee.')
            : t('popupStatusOpening', 'Opening Youwee...'),
          'ok',
        );
      } catch {
        setStatus(t('popupStatusOpenFailed', 'Failed to open Youwee.'), 'error');
      }
    }
  }

  async function handleCopyClick() {
    if (!currentUrl) return;
    try {
      await ext.copyToClipboard(currentUrl);
      setStatus(t('popupCopied', 'URL copied to clipboard.'), 'ok');
    } catch {
      setStatus(t('popupCopyFailed', 'Failed to copy URL.'), 'error');
    }
  }

  async function init() {
    await loadFloatingPrefs();
    updateTexts();
    setMediaValue('video');
    versionLinkEl.href = ext.RELEASE_URL;

    try {
      const tabs = await queryTabs({ active: true, currentWindow: true });
      const activeTab = Array.isArray(tabs) ? tabs[0] : null;
      activeTabId = Number.isInteger(activeTab?.id) ? activeTab.id : null;
      updateUrlState(activeTab?.url || '');
    } catch {
      updateUrlState('');
    }

    downloadBtn.addEventListener('click', () => {
      void handleDownloadClick('download_now');
    });
    queueBtn.addEventListener('click', () => {
      void handleDownloadClick('queue_only');
    });
    copyUrlIconBtn.addEventListener('click', () => {
      void handleCopyClick();
    });
    floatingToggleBtn.addEventListener('click', () => {
      void handleFloatingToggle();
    });
    mediaVideoBtn?.addEventListener('click', () => setMediaValue('video'));
    mediaAudioBtn?.addEventListener('click', () => setMediaValue('audio'));

    if (api?.storage?.onChanged?.addListener) {
      api.storage.onChanged.addListener(handleStorageChanged);
    }
  }

  void init();
})();
