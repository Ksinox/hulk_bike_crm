/**
 * Пересъёмка (2-я попытка) п.14 плитка / п.15 карточка / п.16 история:
 * карточку открываем кликом по строке списка — навигация событием
 * scooterId не поддерживается.
 */
import { clipOf } from "./p9-common.mjs";

async function openScooterRow(page, ctx, match) {
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2200);
  const ok = await page.evaluate((m) => {
    const rows = [...document.querySelectorAll('div[role="button"]')].filter(
      (r) => new RegExp(m).test(r.textContent || ""),
    );
    const row = rows.find((r) => (r.textContent || "").length < 400);
    if (!row) return false;
    row.click();
    return true;
  }, match);
  await ctx.sleep(2400);
  return ok;
}

export async function run(page, ctx) {
  // ── п.14: кроп плитки модели Dio (бейдж «электро», без «партнёрской») ──
  await ctx.gotoRoute("fleet");
  await ctx.sleep(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (x) => (x.textContent || "").trim() === "Модели",
    );
    b?.click();
  });
  await ctx.sleep(1800);
  const dioClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll('div[role="button"], div')]
        .filter(
          (d) =>
            /Dio/.test(d.textContent || "") &&
            /1–2 дн/.test(d.textContent || "") &&
            (d.textContent || "").length < 200,
        )
        .shift();
      return el ?? document.body;
    },
    8,
  );
  if (dioClip) await ctx.shot("p14-3-dio-crop", { clip: dioClip });

  // ── п.15: карточка скутера в аренде ──
  const opened = await openScooterRow(page, ctx, "Gear");
  console.log("card opened:", opened);
  const head = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      id: (t.match(/ID\s*\d+/) || [""])[0],
      num: (t.match(/Номер в аренде[\s\S]{0,24}/) || [""])[0].replace(/\n+/g, " "),
      hash: /#\s?\d\d/.test(t),
    };
  });
  console.log("card:", JSON.stringify(head));
  await ctx.shot("p15-2-card", { jpeg: true });
  const headClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /ID\s*\d{6}/.test(d.textContent || "") &&
            (d.textContent || "").length < 300,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (headClip) await ctx.shot("p15-2-header-crop", { clip: headClip });

  const slotClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Номер в аренде/.test(d.textContent || "") &&
            (d.textContent || "").length < 300,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (slotClip) await ctx.shot("p15-3-menu-crop", { clip: slotClip });
  await ctx.shot("p15-4-slot-changed", { jpeg: true });

  // ── п.16: техника, ушедшая на продажу ──
  const openedSale = await openScooterRow(page, ctx, "ПРОДА");
  console.log("sale card opened:", openedSale);
  const hist = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      block: /Был в аренде/.test(t),
      body: (t.match(/Был в аренде[\s\S]{0,200}/) || [""])[0]
        .replace(/\n+/g, " · ")
        .slice(0, 200),
    };
  });
  console.log("sale card:", JSON.stringify(hist));
  await ctx.shot("p16-1-ex-badge", { jpeg: true });
  const exClip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (d) =>
            /Был в аренде/.test(d.textContent || "") &&
            (d.textContent || "").length < 600,
        )
        .pop();
      return el ?? document.body;
    },
    12,
  );
  if (exClip) await ctx.shot("p16-2-header-crop", { clip: exClip });
}
