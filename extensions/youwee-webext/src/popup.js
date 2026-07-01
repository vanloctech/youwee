(() => {
  const ext = globalThis.YouweeExt;
  if (!ext) return;

  const api = ext.getExtensionApi();
  const STORAGE_KEY = 'youwee-floating-prefs-v1';
  let currentUrl = '';
  let activeTabId = null;
  const manifestVersion = api?.runtime?.getManifest?.()?.version || '0.0.0';
  let floatingPrefs = { enabled: true, collapsedByHost: {} };
  let floatingPrefsChangedInPopup = false;

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
  const actionsEl = document.querySelector('.actions');
  const downloadBtn = document.getElementById('downloadBtn');
  const queueBtn = document.getElementById('queueBtn');
  const summaryBtn = document.getElementById('summaryBtn');
  let mediaMode = 'video';

  const ACTION_ICONS = {
    download:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>',
    queue:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h10"></path><path d="M4 12h10"></path><path d="M4 17h7"></path><path d="M18 10v8"></path><path d="M14 14h8"></path></svg>',
    summary:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"></path><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"></path></svg>',
  };

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

  function executeScriptFiles(tabId, files) {
    const scripting = api?.scripting;
    if (!scripting?.executeScript) {
      return Promise.reject(new Error('scripting.executeScript not available'));
    }

    const details = { target: { tabId }, files };
    try {
      const maybePromise = scripting.executeScript(details);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return maybePromise;
      }
    } catch {
      // Fallback to callback style.
    }

    return new Promise((resolve, reject) => {
      scripting.executeScript(details, (result) => {
        const lastError = api.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(result);
      });
    });
  }

  function insertCssFile(tabId, file) {
    const scripting = api?.scripting;
    if (!scripting?.insertCSS) {
      return Promise.reject(new Error('scripting.insertCSS not available'));
    }

    const details = { target: { tabId }, files: [file] };
    try {
      const maybePromise = scripting.insertCSS(details);
      if (maybePromise && typeof maybePromise.then === 'function') {
        return maybePromise;
      }
    } catch {
      // Fallback to callback style.
    }

    return new Promise((resolve, reject) => {
      scripting.insertCSS(details, () => {
        const lastError = api.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  async function ensureFloatingContentScript() {
    if (!Number.isInteger(activeTabId) || !currentUrl || !ext.isAllowlistedUrl(currentUrl)) {
      return;
    }

    try {
      await sendMessageToTab(activeTabId, { type: 'youwee:floating-status' });
      return;
    } catch {
      // Existing tabs do not always receive content scripts after install or reload.
    }

    if (!api?.scripting?.executeScript) {
      return;
    }

    await insertCssFile(activeTabId, 'content.css').catch(() => {});
    await executeScriptFiles(activeTabId, ['shared.js', 'content.js']);
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

  async function readFloatingPrefs() {
    try {
      const result = await storageGet(STORAGE_KEY);
      return normalizeFloatingPrefs(result?.[STORAGE_KEY]);
    } catch {
      return normalizeFloatingPrefs(null);
    }
  }

  function persistFloatingPrefs() {
    return storageSet({ [STORAGE_KEY]: floatingPrefs });
  }

  async function handleFloatingToggle() {
    floatingPrefsChangedInPopup = true;
    floatingPrefs.enabled = !isFloatingEnabled();
    updateFloatingToggleUi();

    try {
      await persistFloatingPrefs();
      if (floatingPrefs.enabled) {
        await ensureFloatingContentScript().catch(() => {});
      }
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
    floatingPrefsChangedInPopup = false;
    floatingPrefs = normalizeFloatingPrefs(changes[STORAGE_KEY].newValue);
    updateFloatingToggleUi();
  }

  function t(key, fallback) {
    return ext.t(key, fallback);
  }

  function setActionButtonContent(button, icon, label) {
    button.innerHTML = `${icon}<span></span>`;
    const labelEl = button.querySelector('span');
    if (labelEl) {
      labelEl.textContent = label;
    }
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

  function setSummaryAvailability(canSummarize) {
    if (actionsEl) {
      actionsEl.dataset.summaryAvailable = canSummarize ? 'true' : 'false';
    }
    summaryBtn.hidden = !canSummarize;
    summaryBtn.disabled = !canSummarize;
    summaryBtn.title = canSummarize
      ? ''
      : t('floatingSummaryUnavailable', 'Summary is available for YouTube videos');
    summaryBtn.setAttribute('aria-hidden', canSummarize ? 'false' : 'true');
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
    setActionButtonContent(
      downloadBtn,
      ACTION_ICONS.download,
      t('popupPrimaryAction', 'Download now with Youwee'),
    );
    setActionButtonContent(queueBtn, ACTION_ICONS.queue, t('popupQueueAction', 'Add to queue'));
    setActionButtonContent(summaryBtn, ACTION_ICONS.summary, t('popupSummaryAction', 'AI Summary'));
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
      setSummaryAvailability(false);
      copyUrlIconBtn.disabled = true;
      if (mediaVideoBtn) mediaVideoBtn.disabled = true;
      if (mediaAudioBtn) mediaAudioBtn.disabled = true;
      qualitySelect.disabled = true;
      return;
    }

    currentUrl = ext.normalizeVideoUrl(url);
    const canSummarize = ext.isYouTubeUrl(currentUrl);
    urlValueEl.textContent = currentUrl;
    downloadBtn.disabled = false;
    queueBtn.disabled = false;
    setSummaryAvailability(canSummarize);
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

  async function handleSummaryClick() {
    if (!currentUrl) return;

    try {
      if (Number.isInteger(activeTabId)) {
        await sendMessageToTab(activeTabId, {
          type: 'youwee:open-deep-link',
          url: currentUrl,
          action: 'summary',
        });
      } else {
        ext.openSummaryDeepLink(currentUrl);
      }
      setStatus(t('popupStatusSummaryOpening', 'Opening AI Summary in Youwee...'), 'ok');
    } catch {
      try {
        ext.openSummaryDeepLink(currentUrl);
        setStatus(t('popupStatusSummaryOpening', 'Opening AI Summary in Youwee...'), 'ok');
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

  function attachEventListeners() {
    downloadBtn.addEventListener('click', () => {
      void handleDownloadClick('download_now');
    });
    queueBtn.addEventListener('click', () => {
      void handleDownloadClick('queue_only');
    });
    summaryBtn.addEventListener('click', () => {
      void handleSummaryClick();
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

  async function hydratePopupState() {
    const storedFloatingPrefs = await readFloatingPrefs();
    if (!floatingPrefsChangedInPopup) {
      floatingPrefs = storedFloatingPrefs;
      updateFloatingToggleUi();
    }

    try {
      const tabs = await queryTabs({ active: true, currentWindow: true });
      const activeTab = Array.isArray(tabs) ? tabs[0] : null;
      activeTabId = Number.isInteger(activeTab?.id) ? activeTab.id : null;
      updateUrlState(activeTab?.url || '');
      if (isFloatingEnabled()) {
        window.setTimeout(() => {
          void ensureFloatingContentScript();
        }, 150);
      }
    } catch {
      updateUrlState('');
    }
  }

  function init() {
    updateTexts();
    setMediaValue('video');
    versionLinkEl.href = ext.RELEASE_URL;
    attachEventListeners();

    window.setTimeout(() => {
      void hydratePopupState();
    }, 0);
  }

  void init();
})();
