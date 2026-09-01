/** Проверка разнесения платежей по графику через API. */
const API = "https://api-preview.104-128-128-96.sslip.io";

export async function run(page, ctx) {
  await ctx.gotoRoute("dashboard");
  await ctx.sleep(2000);
  const res = await page.evaluate(async (API) => {
    const j = async (url, opts) => {
      const r = await fetch(API + url, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...opts,
      });
      return { status: r.status, body: await r.json().catch(() => null) };
    };
    const clients = (await j("/api/clients")).body?.items ?? [];
    const scooters = (await j("/api/scooters")).body?.items ?? [];
    const free = scooters.find(
      (s) => !s.archivedAt && !s.isPartner && s.baseStatus === "ready",
    ) ?? scooters.find((s) => !s.archivedAt && !s.isPartner);
    if (!clients[0] || !free) return { error: "no data" };

    // Сделка: 120 000 + наценка 2 мес (20 000) = 140 000, взнос 20 000,
    // остаток 120 000 → 2 платежа по 60 000.
    const created = await j("/api/buyout/deals", {
      method: "POST",
      body: JSON.stringify({
        clientId: clients[0].id,
        scooterId: free.id,
        scooterPrice: 120000,
        termMonths: 2,
        downPayment: 20000,
        period: "month",
        blacklistChecked: true,
        airtagConfirmed: true,
        startDate: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10),
      }),
    });
    const id = created.body?.id;
    if (!id) return { error: "create failed", created };
    await j(`/api/buyout/deals/${id}/sign`, { method: "POST", body: "{}" });

    const before = (await j(`/api/buyout/deals/${id}/payments`)).body;
    // Частичный платёж — меньше одной строки графика
    await j(`/api/buyout/deals/${id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount: 25000, method: "cash" }),
    });
    const mid = (await j(`/api/buyout/deals/${id}/payments`)).body;
    // Ещё платёж — должен закрыть первую строку и начать вторую
    await j(`/api/buyout/deals/${id}/payments`, {
      method: "POST",
      body: JSON.stringify({ amount: 50000, method: "card" }),
    });
    const after = (await j(`/api/buyout/deals/${id}/payments`)).body;
    return {
      id,
      terms: {
        total: created.body.total,
        markup: created.body.markup,
        payment: created.body.paymentAmount,
        count: created.body.paymentsCount,
      },
      scheduleBefore: before?.schedule?.map((r) => [r.seq, r.amount, r.paidAmount]),
      overdueBefore: before?.progress?.overdueCount,
      afterPartial: {
        schedule: mid?.schedule?.map((r) => [r.seq, r.amount, r.paidAmount]),
        left: mid?.progress?.left,
      },
      afterSecond: {
        schedule: after?.schedule?.map((r) => [r.seq, r.amount, r.paidAmount]),
        left: after?.progress?.left,
        paidCount: after?.progress?.paidCount,
        overdue: after?.progress?.overdueCount,
      },
      discipline: after?.discipline,
    };
  }, API);
  console.log(JSON.stringify(res, null, 1));
}
