export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'loading';

export type ToastLayout = 'default' | 'plugin-run';

export type PluginRunToastStatus = 'running' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface BaseToastInput {
  id?: string;
  title: string;
  message?: string;
  durationMs?: number;
  dismissible?: boolean;
  action?: ToastAction | null;
}

export interface PluginRunToastData {
  pluginId: string;
  runId?: string;
  pluginName?: string;
  mediaTitle?: string;
  filename?: string;
  mediaUrl?: string;
  status: PluginRunToastStatus;
  errorKind?: string | null;
  errorResource?: string | null;
  details?: string | null;
}

export interface DefaultToastInput extends BaseToastInput {
  layout?: 'default';
  variant: ToastVariant;
  pluginRun?: never;
}

export interface PluginRunToastInput extends BaseToastInput {
  layout: 'plugin-run';
  variant: 'loading' | 'success' | 'error';
  pluginRun: PluginRunToastData;
}

export type ToastInput = DefaultToastInput | PluginRunToastInput;

export interface ToastRecord extends Omit<ToastInput, 'id'> {
  id: string;
  createdAt: number;
  closing: boolean;
  paused: boolean;
  durationMs: number;
  dismissible: boolean;
}

export type ToastUpdate = Partial<Omit<ToastRecord, 'id' | 'createdAt' | 'closing' | 'paused'>>;

export interface ToastApi {
  show: (input: ToastInput) => string;
  success: (input: Omit<DefaultToastInput, 'variant'>) => string;
  error: (input: Omit<DefaultToastInput, 'variant'>) => string;
  warning: (input: Omit<DefaultToastInput, 'variant'>) => string;
  info: (input: Omit<DefaultToastInput, 'variant'>) => string;
  loading: (input: Omit<DefaultToastInput, 'variant'>) => string;
  update: (id: string, patch: ToastUpdate) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}
