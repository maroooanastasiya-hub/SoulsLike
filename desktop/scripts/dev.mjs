import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const devUrl = 'http://localhost:5173';

if (!existsSync(viteBin)) {
  console.error('\n[dev] Не найден Vite. Сначала выполните: npm install\n');
  process.exit(1);
}

const vite = spawn(process.execPath, [viteBin], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});

let electron = null;
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (electron && !electron.killed) electron.kill('SIGTERM');
  if (!vite.killed) vite.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    try {
      const res = await fetch(devUrl, { method: 'GET' });
      if (res.ok) return true;
    } catch {
      // server is still warming up
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

const ready = await waitForServer();
if (!ready) {
  console.error('\n[dev] Vite не запустился за 30 секунд.\n');
  shutdown(1);
} else {
  console.log('\n[dev] Vite готов. Запускаю Electron…\n');
  electron = spawn(electronPath, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_DEV_SERVER_URL: devUrl },
  });
  electron.on('exit', (code) => shutdown(code ?? 0));
}

vite.on('exit', (code) => {
  if (!shuttingDown && code && code !== 0) shutdown(code);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
