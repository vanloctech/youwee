type PersistManualChannelDownloadCompletionInput = {
  downloadVideo: () => Promise<void>;
  markDownloaded: () => Promise<void>;
  onPersistError: (error: unknown) => void;
};

export async function persistManualChannelDownloadCompletion({
  downloadVideo,
  markDownloaded,
  onPersistError,
}: PersistManualChannelDownloadCompletionInput): Promise<void> {
  await downloadVideo();

  try {
    await markDownloaded();
  } catch (error) {
    onPersistError(error);
  }
}
