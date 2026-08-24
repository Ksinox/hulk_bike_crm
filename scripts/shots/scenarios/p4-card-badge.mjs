/** Пункт 4: плашка «Причина возврата» в карточке завершённой аренды №35. */
import { clipOf } from "./p9-common.mjs";

export async function run(page, ctx) {
  await ctx.gotoRoute("rentals", { rentalId: 35 });
  await ctx.sleep(1800);
  await page.evaluate(() => {
    const later = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent || "").trim() === "Позже",
    );
    later?.click();
  });
  await ctx.sleep(500);
  // завершённая аренда — во вкладке «Завершены»
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll("button,[role=tab]")].find(
      (b) => (b.textContent || "").trim() === "Завершены",
    );
    tab?.click();
  });
  await ctx.sleep(1200);
  await page.evaluate(() => {
    // самый глубокий элемент с «#0035» — клик всплывёт до строки-обработчика
    const leaf = [...document.querySelectorAll("*")]
      .filter(
        (e) => (e.textContent || "").trim() === "#0035" && !e.children.length,
      )
      .pop();
    leaf?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  await ctx.sleep(1800);
  const done = await page.evaluate(() => ({
    completed: document.body.innerText.includes("Причина возврата"),
    text: (document.body.innerText.match(/Причина возврата:?\s*[^\n]+/) || [])[0],
  }));
  console.log("result:", JSON.stringify(done));
  const clip = await clipOf(
    page,
    () => {
      const el = [...document.querySelectorAll("div")]
        .filter(
          (e) =>
            /Причина возврата/.test(e.textContent || "") &&
            (e.textContent || "").length < 120,
        )
        .pop();
      return el ?? document.body;
    },
    16,
  );
  if (clip) await ctx.shot("p4-3-card-crop", { clip });
  await ctx.shot("p4-3-card-full", { jpeg: true });
}
