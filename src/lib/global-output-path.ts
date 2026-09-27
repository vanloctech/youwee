export const GLOBAL_OUTPUT_PATH_EVENT = 'youwee-global-output-path-changed';

export function announceGlobalOutputPath(outputPath: string): void {
  window.dispatchEvent(new CustomEvent<string>(GLOBAL_OUTPUT_PATH_EVENT, { detail: outputPath }));
}

export function onGlobalOutputPathChanged(listener: (outputPath: string) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(GLOBAL_OUTPUT_PATH_EVENT, handler);
  return () => window.removeEventListener(GLOBAL_OUTPUT_PATH_EVENT, handler);
}
