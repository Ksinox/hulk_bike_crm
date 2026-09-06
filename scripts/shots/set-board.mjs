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
    { metric: "rent.park_load", size: "l", plan: 90 },
    { metric: "rent.active", size: "m", plan: 6 },
    { metric: "rent.overdue", size: "m", plan: null },
    { metric: "rent.income_today", size: "m", plan: null },
    { metric: "rent.revenue", size: "m", plan: 300000 },
    { metric: "rent.returns", size: "s", plan: null, period: "week" },
    { metric: "rent.new_clients", size: "s", plan: 5, period: "week" },
    { metric: "sales.count", size: "s", plan: 10 },
    { metric: "sales.revenue", size: "m", plan: 2000000 },
    { metric: "sales.profit", size: "m", plan: 500000 },
    { metric: "service.count", size: "s", plan: 8 },
    { metric: "service.revenue", size: "m", plan: 40000 },
    { metric: "service.profit", size: "s", plan: null },
    { metric: "buyout.active", size: "s", plan: 5 },
    { metric: "plan.summary", size: "l" },
  ],
};
const put = await fetch(API + "/api/analytics/board", {
  method: "PUT",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify(board),
});
console.log("PUT", put.status, (await put.text()).slice(0, 120));
