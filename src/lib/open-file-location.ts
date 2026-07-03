import { invoke } from '@tauri-apps/api/core';

export async function openFileLocation(filepath: string): Promise<void> {
  await invoke('open_file_location', { filepath });
}
