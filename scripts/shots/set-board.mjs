/** Ставит на preview осмысленную доску аналитики (для кадров лендинга). */
const API = "https://api-preview.104-128-128-96.sslip.io";
const r = await fetch(API + "/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "shotbot", password: process.env.SHOTBOT_PASS, remember: true }),
});
const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
const board = {
  period: "month",
  title: "Как идут дела",
  tiles: [
    { metric: "rent.park_load", w: 2, h: 2, plan: 90 },
    { metric: "rent.revenue", w: 2, h: 1, plan: 300000 },
    { metric: "rent.overdue", w: 1, h: 1, plan: null },
    { metric: "rent.income_today", w: 1, h: 1, plan: null },
    { metric: "rent.active", w: 1, h: 1, plan: 6 },
    { metric: "rent.new_clients", w: 1, h: 1, plan: 5, period: "week" },
    { metric: "sales.count", w: 1, h: 1, plan: 10 },
    { metric: "sales.revenue", w: 2, h: 1, plan: 2000000 },
    { metric: "sales.profit", w: 1, h: 1, plan: 500000 },
    { metric: "service.count", w: 1, h: 1, plan: 8 },
    { metric: "service.revenue", w: 2, h: 1, plan: 40000 },
    { metric: "buyout.active", w: 1, h: 1, plan: 5 },
    { metric: "plan.summary", w: 3, h: 2 },
  ],
};
const put = await fetch(API + "/api/analytics/board", {
  method: "PUT",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify(board),
});
console.log("PUT", put.status, (await put.text()).slice(0, 120));
