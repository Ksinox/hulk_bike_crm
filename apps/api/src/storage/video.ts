import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Обработка видео ущерба для веба. Цель — МАКСИМАЛЬНОЕ качество без лишнего
 * сжатия (по итогам ресёрча Instagram/MediaRecorder/ffmpeg):
 *
 *  • Если видео УЖЕ H.264/AVC (запись нашей in-app камеры через MediaRecorder
 *    отдаёт ровно его; «Камера» iPhone в режиме «Наиболее совместимый» — тоже)
 *    → РЕМУКС: `-c copy` (копия битстрима, НОЛЬ потерь) + `+faststart`
 *    (moov в начало, играет до полной загрузки). Никакого второго сжатия.
 *  • Если HEVC/H.265 (дефолт iPhone «High Efficiency») или иной кодек, который
 *    не играет на Android Chrome → ПЕРЕ-КОДИРУЕМ в H.264 на макс. качестве
 *    (slow + lanczos + 1440p + CRF 16). Это единственный неизбежный случай.
 *
 * ffprobe/ffmpeg доступны в рантайм-образе API (apk add ffmpeg).
 */

function run(
  cmd: string,
  args: string[],
  timeoutMs = 4 * 60 * 1000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    let settled = false;
    const finish = (cb: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cb();
    };
    // Подстраховка: если ffmpeg завис (битый вход и т.п.) — убиваем, чтобы
    // видео не висело в «processing» вечно. Вызывающий по ошибке оставит
    // оригинал и пометит ready.
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(() => reject(new Error(`${cmd} timeout ${timeoutMs}ms`)));
    }, timeoutMs);
    proc.stderr?.on("data", (d) => {
      err += d.toString();
    });
    proc.on("error", (e) => finish(() => reject(e)));
    proc.on("close", (code) =>
      finish(() =>
        code === 0
          ? resolve()
          : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`)),
      ),
    );
  });
}

/** Запускает команду и возвращает stdout (для ffprobe). */
function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d) => (out += d.toString()));
    proc.stderr?.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)),
    );
  });
}

/** Кодек первой видеодорожки (h264 / hevc / vp9 / …) или null. */
async function probeVideoCodec(path: string): Promise<string | null> {
  try {
    const out = await runCapture("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name",
      "-of",
      "default=nk=1:nw=1",
      path,
    ]);
    return out.trim().toLowerCase() || null;
  } catch {
    return null; // не смогли определить — будем транскодировать (безопасно)
  }
}

function extOf(name: string): string {
  const m = /\.[a-z0-9]+$/i.exec(name);
  return m ? m[0] : ".mov";
}

/** Аргументы пере-кодирования в H.264 на максимальном качестве. */
function transcodeArgs(inPath: string, outPath: string): string[] {
  return [
    "-y",
    "-i",
    inPath,
    // Потолок 1440p (большая сторона ≤2560), 1080p не апскейлим; lanczos —
    // резче дефолтного bicubic.
    "-vf",
    "scale=min(2560\\,iw):min(2560\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos+accurate_rnd",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    // medium вместо slow — заметно быстрее, при lanczos+CRF16 резкость сохраняется
    // (slow на маломощном сервере давал минуты ожидания).
    "-preset",
    "medium",
    "-crf",
    "16",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outPath,
  ];
}

/**
 * Готовит видео-буфер к вебу. Возвращает MP4-буфер и (best-effort) JPEG-обложку.
 * H.264 → ремукс (без потерь), иначе → транскод. Кидает, если основной шаг не
 * удался (обложка опциональна).
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
    const codec = await probeVideoCodec(inPath);
    if (codec === "h264") {
      // Уже H.264 → РЕМУКС без пере-кодирования (ноль потерь) + faststart.
      // На случай экзотики (ffmpeg не смог скопировать) — фолбэк в транскод.
      try {
        await run("ffmpeg", [
          "-y",
          "-i",
          inPath,
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          outPath,
        ]);
      } catch {
        await run("ffmpeg", transcodeArgs(inPath, outPath));
      }
    } else {
      // HEVC/иное → пере-кодируем в H.264 (макс. качество).
      await run("ffmpeg", transcodeArgs(inPath, outPath));
    }
    let poster: Buffer | null = null;
    try {
      // Кадр-обложка из готового MP4 (≈0.3s от начала).
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
