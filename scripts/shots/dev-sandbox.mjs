/**
 * Локальный фронт поверх песочницы API (копия базы превью на :4999 через
 * ssh-туннель). /api проксируется vite'ом — запросы same-origin, куки
 * работают. Нужно для съёмки действий под ключом/кодом директора, которые
 * на настоящем превью проверять нельзя.
 *   ssh -N -L 4999:127.0.0.1:4999 root@…   затем   node scripts/shots/dev-sandbox.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = process.env.PORT ?? "5173";
const child = spawn("pnpm", ["-C", "apps/web", "exec", "vite", "--port", port, "--strictPort"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    SHOT_PROXY_API: process.env.SHOT_PROXY_API ?? "http://localhost:4999",
    VITE_API_URL: `http://localhost:${port}`,
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
