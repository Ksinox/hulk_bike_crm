/** Пункт 2.27 на «Развитии»: кадры отдаются, вёрстка не поехала. */
export async function run(page, ctx) {
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ctx.sleep(3200);
  await ctx.gotoRoute("progress");
  await ctx.sleep(2600);
  console.log(await page.evaluate(async () => {
    const t = document.body.innerText;
    const i = t.indexOf("Напоминания о платежах");
    const srcs = [
      "v6-reminders", "v6-buyout-payment", "v6-investor-payout",
      "v6-buyout-overview", "v6-topbar-1280", "v6-client-narrow",
      "v6-mobile-buyout",
    ];
    const checks = {};
    for (const s of srcs) {
      const r = await fetch(`/progress/${s}.jpg`, { method: "HEAD" });
      checks[s] = r.status;
    }
    return {
      itemFound: i >= 0,
      title: i < 0 ? "" : t.slice(i, i + 80).split("\n").join(" / "),
      images: checks,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }));
  await ctx.shot("chk-landing-227", { jpeg: true });
}
