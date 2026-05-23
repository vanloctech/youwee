import { runPluginModule } from './runtime';
import type { PluginDefinition } from './types';

async function loadPluginModule(): Promise<PluginDefinition | { default?: PluginDefinition }> {
  const pluginMain = process.env.YOUWEE_PLUGIN_MAIN;

  if (!pluginMain) {
    throw new Error('YOUWEE_PLUGIN_MAIN is not set.');
  }

  const loaded = require(pluginMain) as PluginDefinition | { default?: PluginDefinition };
  return loaded;
}

async function main(): Promise<void> {
  const plugin = await loadPluginModule();
  await runPluginModule(plugin);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
