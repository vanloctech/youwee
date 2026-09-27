import { invoke } from '@tauri-apps/api/core';

function isAria2PartialFailure(error: unknown): boolean {
  const text =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : (JSON.stringify(error) ?? String(error));
  return (
    /aria2c exited with code\s*18\b/i.test(text) || /aria2.*(?:code|exit)[^0-9]*18\b/i.test(text)
  );
}

/**
 * aria2 can fail after YouTube's signed fragment URL expires. Retry once with
 * yt-dlp's native downloader so a transient aria2 failure does not fail the job.
 */
export async function invokeDownloadVideo(input: Record<string, unknown>): Promise<void> {
  try {
    await invoke('download_video', input);
  } catch (error) {
    if (input.useAria2 === true && isAria2PartialFailure(error)) {
      await invoke('download_video', {
        ...input,
        useAria2: false,
        aria2Args: '',
      });
      return;
    }
    throw error;
  }
}
