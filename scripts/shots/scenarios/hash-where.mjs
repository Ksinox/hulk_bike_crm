/** Где именно на дашборде осталось «Dio #01». */
export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2600);
  const found = await page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      if (/#\s*\d{1,2}(?!\d)/.test(n.nodeValue || "") && /[A-Za-zА-Яа-я]/.test(n.nodeValue || "")) {
        const el = n.parentElement;
        out.push({
          text: (n.nodeValue || "").trim().slice(0, 60),
          cls: (el?.className || "").toString().slice(0, 80),
          path: (() => {
            const p = [];
            let e = el;
            for (let i = 0; i < 5 && e; i++) {
              p.push(e.tagName.toLowerCase());
              e = e.parentElement;
            }
            return p.join("<");
          })(),
        });
      }
    }
    return out.slice(0, 10);
  });
  console.log(JSON.stringify(found, null, 1));
}
