import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Перекодирование видео ущерба через ffmpeg в веб-стандартный H.264 MP4 +
 * кадр-обложка. Зачем:
 *  - телефоны (особенно iPhone) пишут HEVC/H.265 + хранят поворот в метаданных
 *    → браузеры такой сырой файл не показывают (чёрный экран) и теряют
 *    ориентацию (портрет 9:16 выглядит как 16:9);
 *  - после ffmpeg получаем H.264 MP4 с «вшитым» поворотом и +faststart —
 *    играет на любом устройстве/браузере, ориентация верная.
 *
 * ffmpeg доступен в рантайм-образе API (apk add ffmpeg, см. Dockerfile).
 * Принимает ЛЮБОЙ вход (iPhone HEVC, Android H.264/VP9 и т.д.).
 */

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr?.on("data", (d) => {
      err += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`)),
    );
  });
}

function extOf(name: string): string {
  const m = /\.[a-z0-9]+$/i.exec(name);
  return m ? m[0] : ".mov";
}

/**
 * Транскодирует видео-буфер. Возвращает MP4-буфер и (best-effort) JPEG-обложку.
 * Кидает, если основной транскод не удался (обложка опциональна).
 */
export async function transcodeVideo(
  buf: Buffer,
  originalName: string,
): Promise<{ mp4: Buffer; poster: Buffer | null }> {
  const dir = await mkdtemp(join(tmpdir(), "dmgvid-"));
  const inPath = join(dir, `in${extOf(originalName)}`);
  const outPath = join(dir, "out.mp4");
  const posterPath = join(dir, "poster.jpg");
  try {
    await writeFile(inPath, buf);
    // Качество «как у Telegram» (по итогам ресёрча). H.264/AAC — единственный
    // кодек, который играет ВЕЗДЕ (iOS Safari + Android Chrome). «Мыло» давали:
    //   1) preset veryfast → slow (главный выигрыш по чёткости мелочи).
    //   2) даунскейл дефолтным bicubic → lanczos.
    // По просьбе заказчика (детали царапин/трещин всё ещё слабоваты) подняли
    // ПОТОЛОК разрешения 1080p→1440p (большая сторона ≤2560): 1440p/4K-исходники
    // теперь сохраняют больше деталей (1080p-исходники не апскейлим — decrease).
    // И CRF 18→16 (визуально прозрачно, больше высокочастотной детали).
    // БЕЗ -tune (psy-rd=1.0 остаётся). Видео короткие, транскод фоновый → slow ок.
    await run("ffmpeg", [
      "-y",
      "-i",
      inPath,
      "-vf",
      "scale=min(2560\\,iw):min(2560\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos+accurate_rnd",
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "slow",
      "-crf",
      "16",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outPath,
    ]);
    let poster: Buffer | null = null;
    try {
      // Кадр-обложка из УЖЕ повёрнутого MP4 (≈0.3s от начала).
      await run("ffmpeg", [
        "-y",
        "-ss",
        "0.3",
        "-i",
        outPath,
        "-frames:v",
        "1",
        "-q:v",
        "3",
        posterPath,
      ]);
      poster = await readFile(posterPath);
    } catch {
      poster = null; // обложка опциональна
    }
    const mp4 = await readFile(outPath);
    return { mp4, poster };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
