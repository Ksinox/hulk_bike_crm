import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

/**
 * Генерирует dist/version.json на каждой сборке.
 *
 * Значение уникально для каждого билда: <git-sha>.<base36-таймстамп>
 * (если .git недоступен в Docker-сборке — fallback 'build.<ts>').
 *
 * Зачем: клиент раз в 5 мин опрашивает /version.json (см. lib/version-check.ts)
 * и показывает тост «доступна новая версия» когда строка сменилась. Раньше
 * это был статичный committed-файл (всегда 0.8.33) → тост юзерам не приходил,
 * а скрипты редеплоя зря ругались «версия не изменилась». Теперь значение
 * меняется при КАЖДОЙ сборке, поэтому деплой детектится корректно.
 */
let sha = "build";
try {
  sha = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim() || "build";
} catch {
  // .git нет (Docker-сборка из копии исходников) — остаётся 'build'
}
/**
 * Строка билда — уникальна для каждой сборки. Используется в version.json
 * (тост «новая версия») и как кэш-бастер картинок лендинга «Развитие»
 * (см. __BUILD_VERSION__ ниже): кадры пересъёмок живут под теми же именами
 * файлов, и без ?v= браузер показывал старые из кэша.
 */
const buildVersion = `${sha}.${Date.now().toString(36)}`;

function emitVersionJson(): Plugin {
  // Пользовательская версия (1.0.0) — для тоста «Доступна новая версия N» и
  // раздела «Что нового». Доступна и в Docker-сборке (package.json — исходник).
  let appVersion = "0.0.0";
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
    ) as { version?: string };
    appVersion = pkg.version ?? "0.0.0";
  } catch {
    // package.json недоступен — оставляем заглушку
  }
  const version = buildVersion;
  return {
    name: "emit-version-json",
    closeBundle() {
      const out = path.resolve(__dirname, "dist", "version.json");
      fs.writeFileSync(out, `${JSON.stringify({ version, appVersion })}\n`);
    },
  };
}

/**
 * Съёмка кадров «БЫЛО» для лендинга «Развитие»: локальный фронт старой
 * ревизии + данные preview. Адрес API кладётся в apps/web/.shot-proxy
 * (файл в .gitignore) — тогда dev-сервер проксирует /api туда, запросы
 * остаются same-origin, и CORS/third-party-куки не мешают.
 */
function shotProxyTarget(): string | null {
  if (process.env.SHOT_PROXY_API) return process.env.SHOT_PROXY_API;
  try {
    const v = fs
      .readFileSync(path.resolve(__dirname, ".shot-proxy"), "utf8")
      .trim();
    return v || null;
  } catch {
    return null;
  }
}

export default defineConfig({
  plugins: [react(), emitVersionJson()],
  define: {
    // Кэш-бастер для статики из public/ (кадры «Развития»): имена файлов
    // при пересъёмке не меняются, поэтому к URL добавляется ?v=<билд>.
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    ...(shotProxyTarget()
      ? {
          proxy: {
            "/api": {
              target: shotProxyTarget()!,
              changeOrigin: true,
              secure: false,
            },
          },
        }
      : {}),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
