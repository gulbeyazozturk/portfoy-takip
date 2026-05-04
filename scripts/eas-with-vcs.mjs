/**
 * EAS_NO_VCS=1 bazı ortamlarda (IDE terminali) kalıcı gelir; git tabanlı build özelliklerini kapatır.
 * Bu sarmalayıcı değişkeni kaldırıp eas-cli'yi çalıştırır — Windows / macOS / Linux uyumlu.
 */
import { spawnSync } from 'node:child_process';

delete process.env.EAS_NO_VCS;

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/eas-with-vcs.mjs <eas-cli args...>');
  process.exit(1);
}

const result = spawnSync('npx', ['eas-cli', ...args], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

process.exit(result.status === null ? 1 : result.status);
