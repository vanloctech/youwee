import { describe, expect, test } from 'bun:test';
import { createPluginToastId, formatPluginToastText } from '../src/lib/plugin-toast';

describe('createPluginToastId', () => {
  test('combines plugin id and run id', () => {
    expect(createPluginToastId('plugin-1', 'run-1')).toBe('plugin-1:run-1');
  });

  test('falls back to "unknown" when run id is missing', () => {
    expect(createPluginToastId('plugin-1')).toBe('plugin-1:unknown');
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

  test('drops lines that reduce to empty after stripping the level prefix', () => {
    expect(formatPluginToastText('[info] \nReady')).toBe('Ready');
  });

  test('leaves trailing text untouched when metadata is not valid json', () => {
    expect(formatPluginToastText('[warn] Disk usage {not json}')).toBe('Disk usage {not json}');
  });
});
