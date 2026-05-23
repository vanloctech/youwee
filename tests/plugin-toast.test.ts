import { describe, expect, test } from 'bun:test';
import {
  appendPluginToastOutput,
  formatPluginToastText,
  type PluginToastState,
  upsertPluginToast,
} from '../src/lib/plugin-toast';

function makeToast(overrides: Partial<PluginToastState> = {}): PluginToastState {
  return {
    id: 'toast-1',
    pluginId: 'plugin-1',
    runId: 'run-1',
    pluginName: 'GG Drive',
    status: 'running',
    message: 'Running GG Drive',
    ...overrides,
  };
}

describe('appendPluginToastOutput', () => {
  test('replaces the running toast message with the latest runtime output', () => {
    const result = appendPluginToastOutput([makeToast()], {
      pluginId: 'plugin-1',
      pluginName: 'GG Drive',
      runId: 'run-1',
      chunk: '[info] Preparing Google Drive upload {"filename":"demo.mp4"}',
    });

    expect(result[0]?.message).toBe('Preparing Google Drive upload');
  });

  test('attaches late output to the running toast even when run id does not match exactly', () => {
    const result = appendPluginToastOutput([makeToast({ runId: 'unknown' })], {
      pluginId: 'plugin-1',
      pluginName: 'GG Drive',
      runId: 'run-1',
      chunk: '[info] File loaded into memory {"bytes":123}',
    });

    expect(result[0]?.runId).toBe('unknown');
    expect(result[0]?.message).toBe('File loaded into memory');
  });
});

describe('upsertPluginToast', () => {
  test('replaces the running message with the success message when status changes', () => {
    const running = appendPluginToastOutput([makeToast()], {
      pluginId: 'plugin-1',
      pluginName: 'GG Drive',
      runId: 'run-1',
      chunk: '[info] Google Drive response received {"status":200}',
    });

    const success = upsertPluginToast(running, {
      toastId: 'toast-2',
      pluginId: 'plugin-1',
      runId: 'run-1',
      pluginName: 'GG Drive',
      status: 'success',
      message: 'Uploaded to Google Drive',
    });

    expect(success[0]?.status).toBe('success');
    expect(success[0]?.message).toBe('Uploaded to Google Drive');
  });
});

describe('formatPluginToastText', () => {
  test('removes log level prefix and trailing json metadata', () => {
    expect(
      formatPluginToastText(
        '[info] Preparing Google Drive upload {"filename":"demo.mp4","hasFolderId":true}',
      ),
    ).toBe('Preparing Google Drive upload');
  });

  test('keeps plain text lines unchanged', () => {
    expect(formatPluginToastText('Runtime: javascript\nTimeout: 300s')).toBe(
      'Runtime: javascript\nTimeout: 300s',
    );
  });
});
