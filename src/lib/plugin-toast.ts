export interface PluginToastState {
  id: string;
  pluginId: string;
  runId?: string;
  pluginName?: string;
  mediaTitle?: string;
  filename?: string;
  mediaUrl?: string;
  status: string;
  message: string;
}

function stripStructuredMetadata(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return '';
  }

  const withoutLevel = trimmed.replace(/^\[(debug|info|warn|error)\]\s*/i, '');
  const jsonStart = withoutLevel.lastIndexOf(' {');
  if (jsonStart <= 0) {
    return withoutLevel;
  }

  const message = withoutLevel.slice(0, jsonStart).trimEnd();
  const metadata = withoutLevel.slice(jsonStart + 1).trim();
  if (!metadata.startsWith('{') || !metadata.endsWith('}')) {
    return withoutLevel;
  }

  try {
    JSON.parse(metadata);
    return message;
  } catch {
    return withoutLevel;
  }
}

export function formatPluginToastText(text: string): string {
  return text
    .split('\n')
    .map(stripStructuredMetadata)
    .filter((line) => line.length > 0)
    .join('\n');
}

export function appendPluginToastOutput(
  current: PluginToastState[],
  input: {
    pluginId: string;
    pluginName?: string;
    runId?: string;
    chunk: string;
    mediaTitle?: string;
    filename?: string;
    mediaUrl?: string;
  },
): PluginToastState[] {
  const normalizedChunk = formatPluginToastText(input.chunk).trimEnd();
  if (!normalizedChunk) {
    return current;
  }

  const activeRunId = input.runId ?? 'unknown';
  const existing = current.find(
    (toast) =>
      toast.pluginId === input.pluginId &&
      ((toast.runId ?? 'unknown') === activeRunId || toast.status === 'running'),
  );

  if (existing) {
    return current.map((toast) => {
      if (
        toast.pluginId === input.pluginId &&
        ((toast.runId ?? 'unknown') === activeRunId || toast.id === existing.id)
      ) {
        return {
          ...toast,
          runId: toast.runId ?? activeRunId,
          pluginName: input.pluginName ?? toast.pluginName,
          mediaTitle: input.mediaTitle ?? toast.mediaTitle,
          filename: input.filename ?? toast.filename,
          mediaUrl: input.mediaUrl ?? toast.mediaUrl,
          message: normalizedChunk,
        };
      }
      return toast;
    });
  }

  return [
    {
      id: `${input.pluginId}-runtime-fallback`,
      pluginId: input.pluginId,
      runId: activeRunId,
      pluginName: input.pluginName,
      mediaTitle: input.mediaTitle,
      filename: input.filename,
      mediaUrl: input.mediaUrl,
      status: 'running',
      message: normalizedChunk,
    },
    ...current,
  ].slice(0, 3);
}

export function upsertPluginToast(
  current: PluginToastState[],
  input: {
    toastId: string;
    pluginId: string;
    runId?: string;
    pluginName?: string;
    mediaTitle?: string;
    filename?: string;
    mediaUrl?: string;
    status: string;
    message: string;
  },
): PluginToastState[] {
  const normalizedRunId = input.runId ?? 'unknown';
  const remaining = current.filter(
    (item) => !(item.pluginId === input.pluginId && (item.runId ?? 'unknown') === normalizedRunId),
  );

  return [
    {
      id: input.toastId,
      pluginId: input.pluginId,
      runId: normalizedRunId,
      pluginName: input.pluginName,
      mediaTitle: input.mediaTitle,
      filename: input.filename,
      mediaUrl: input.mediaUrl,
      status: input.status,
      message: input.message,
    },
    ...remaining,
  ].slice(0, 3);
}
