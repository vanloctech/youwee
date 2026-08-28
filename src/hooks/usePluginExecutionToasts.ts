import { listen } from '@tauri-apps/api/event';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/toast';
import { createPluginToastId, formatPluginToastText } from '@/lib/plugin-toast';
import type { PluginExecutionOutputEvent, PluginExecutionStatusEvent } from '@/lib/types';

async function notify(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // best effort only
  }
}

export function usePluginExecutionToasts() {
  const toast = useToast();
  const pluginNotificationRef = useRef<Map<string, { status: string; at: number }>>(new Map());
  const activePluginRunRef = useRef<Map<string, string>>(new Map());
  const pluginRuntimeNameRef = useRef(new Map<string, string>());

  const appendOutputToToast = useCallback(
    (
      pluginId: string,
      pluginName: string | undefined,
      runId: string | undefined,
      chunk: string,
      mediaTitle?: string,
      filename?: string,
      mediaUrl?: string,
    ) => {
      const activeRunId = runId ?? activePluginRunRef.current.get(pluginId) ?? 'unknown';
      const normalizedChunk = formatPluginToastText(chunk).trimEnd();
      if (!normalizedChunk) {
        return;
      }

      const resolvedPluginName = pluginName ?? pluginRuntimeNameRef.current.get(pluginId);
      toast.show({
        id: createPluginToastId(pluginId, activeRunId),
        layout: 'plugin-run',
        variant: 'loading',
        title: resolvedPluginName ?? '',
        message: normalizedChunk,
        durationMs: 0,
        pluginRun: {
          pluginId,
          runId: activeRunId,
          pluginName: resolvedPluginName,
          mediaTitle,
          filename,
          mediaUrl,
          status: 'running',
        },
      });
    },
    [toast],
  );

  const pushPluginToast = useCallback(
    (
      pluginId: string,
      status: string,
      runId: string | undefined,
      pluginName?: string,
      message?: string,
      mediaTitle?: string,
      filename?: string,
      mediaUrl?: string,
      durationMs?: number,
      runtimeError?: {
        errorKind?: string | null;
        errorResource?: string | null;
        details?: string | null;
      },
    ) => {
      const normalizedRunId = runId ?? 'unknown';
      const toastId = createPluginToastId(pluginId, normalizedRunId);
      if (status === 'running') {
        activePluginRunRef.current.set(pluginId, normalizedRunId);
      }
      const resolvedMessage =
        message ||
        (status === 'running'
          ? `Plugin ${pluginName ?? pluginId} is running`
          : status === 'error'
            ? `Plugin ${pluginName ?? pluginId} failed`
            : `Plugin ${pluginName ?? pluginId} finished`);
      const resolvedPluginName = pluginName ?? pluginRuntimeNameRef.current.get(pluginId);
      const toastStatus =
        status === 'error' ? 'error' : status === 'success' ? 'success' : 'running';

      toast.show({
        id: toastId,
        layout: 'plugin-run',
        variant:
          toastStatus === 'running' ? 'loading' : toastStatus === 'error' ? 'error' : 'success',
        title: resolvedPluginName ?? '',
        message: resolvedMessage,
        durationMs: durationMs ?? (toastStatus === 'running' ? 0 : 7000),
        pluginRun: {
          pluginId,
          runId: normalizedRunId,
          pluginName: resolvedPluginName,
          mediaTitle,
          filename,
          mediaUrl,
          status: toastStatus,
          errorKind: runtimeError?.errorKind,
          errorResource: runtimeError?.errorResource,
          details: runtimeError?.details,
        },
      });
    },
    [toast],
  );

  useEffect(() => {
    const unlisten = listen<PluginExecutionStatusEvent>('plugin-execution-status', (event) => {
      const {
        pluginId,
        runId,
        pluginName,
        status,
        message,
        resolvedProvider,
        resolvedSource,
        details,
        errorKind,
        errorResource,
        mediaTitle,
        filename,
        mediaUrl,
      } = event.payload;
      const normalizedRunId = runId ?? activePluginRunRef.current.get(pluginId) ?? 'unknown';
      const now = Date.now();
      const notificationKey = `${pluginId}:${normalizedRunId}:${status}`;
      const last = pluginNotificationRef.current.get(notificationKey);
      if (last && last.status === status && now - last.at < 1500) {
        return;
      }
      if (pluginName) {
        pluginRuntimeNameRef.current.set(pluginId, pluginName);
      }
      activePluginRunRef.current.set(pluginId, normalizedRunId);

      const normalizedMessage = message ?? undefined;
      const normalizedPluginName =
        pluginName ||
        pluginRuntimeNameRef.current.get(pluginId) ||
        normalizedMessage?.replace('Running ', '').replace(' failed', '') ||
        undefined;

      if (status === 'running') {
        pluginNotificationRef.current.set(notificationKey, { status, at: now });
        const statusMessage =
          normalizedMessage || `Plugin ${normalizedPluginName ?? pluginId} is running`;
        void notify('Youwee Plugin', statusMessage);
        pushPluginToast(
          pluginId,
          status,
          normalizedRunId,
          normalizedPluginName,
          statusMessage,
          mediaTitle ?? undefined,
          filename ?? undefined,
          mediaUrl ?? undefined,
          0,
        );
        return;
      }

      if (status === 'error') {
        pluginNotificationRef.current.set(notificationKey, { status, at: now });
        const statusMessage =
          normalizedMessage || `Plugin ${normalizedPluginName ?? pluginId} failed`;
        const toastMessage =
          !errorKind && (resolvedProvider || resolvedSource)
            ? `${statusMessage}\n${resolvedProvider || ''} ${resolvedSource || ''}`.trim()
            : statusMessage;
        void notify('Youwee Plugin', statusMessage);
        pushPluginToast(
          pluginId,
          status,
          normalizedRunId,
          normalizedPluginName,
          toastMessage,
          mediaTitle ?? undefined,
          filename ?? undefined,
          mediaUrl ?? undefined,
          7000,
          { errorKind, errorResource, details },
        );
        return;
      }

      if (status === 'success') {
        pluginNotificationRef.current.set(notificationKey, { status, at: now });
        const statusMessage =
          normalizedMessage || `Plugin ${normalizedPluginName ?? pluginId} finished successfully`;
        void notify('Youwee Plugin', statusMessage);
        pushPluginToast(
          pluginId,
          status,
          normalizedRunId,
          normalizedPluginName,
          statusMessage,
          mediaTitle ?? undefined,
          filename ?? undefined,
          mediaUrl ?? undefined,
          7000,
        );
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [pushPluginToast]);

  useEffect(() => {
    const unlisten = listen<PluginExecutionOutputEvent>('plugin-execution-output', (event) => {
      const { pluginId, pluginName, runId, chunk, mediaTitle, filename, mediaUrl } = event.payload;
      if (pluginName) {
        pluginRuntimeNameRef.current.set(pluginId, pluginName);
      }
      appendOutputToToast(
        pluginId,
        pluginName ?? undefined,
        runId ?? undefined,
        chunk,
        mediaTitle ?? undefined,
        filename ?? undefined,
        mediaUrl ?? undefined,
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appendOutputToToast]);
}
