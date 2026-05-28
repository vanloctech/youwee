import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import type { Page } from '@/components/layout';
import type { SettingsSectionId } from '@/components/settings';

export function useTrayEvents(
  setCurrentPage: (page: Page) => void,
  openSettingsPage: (section?: SettingsSectionId) => void,
  checkForUpdate: () => Promise<unknown>,
) {
  useEffect(() => {
    const unlisten = listen<string>('tray-open-channel', () => {
      setCurrentPage('channels');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setCurrentPage]);

  useEffect(() => {
    const unlisten = listen('tray-check-update', () => {
      openSettingsPage('about');
      void checkForUpdate();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [checkForUpdate, openSettingsPage]);

  useEffect(() => {
    const unlisten = listen('tray-open-settings', () => {
      openSettingsPage('general');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openSettingsPage]);

  useEffect(() => {
    const unlisten = listen('tray-open-extension', () => {
      openSettingsPage('extension');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openSettingsPage]);
}
