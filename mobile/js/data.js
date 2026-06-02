(function (w) {
  var HB_DATA = {};

  HB_DATA.snapshotDate = "2026-10-13";
  HB_DATA.snapshotLabel = "13.10.2026";

  HB_DATA.revenue = {
    day: { value: 18400, delta: 12, label: "за день", mix: "8 выдач" },
    week: { value: 142600, delta: 8, label: "за неделю", mix: "аренда + продления" },
    month: { value: 625800, delta: -3, label: "за месяц", mix: "90% аренда, 10% продажи" }
  };

  HB_DATA.activity = [
    { title: "Возврат принят", body: "Jog #05 от Алексея Р.", when: "8 мин назад", tone: "green" },
    { title: "Аренда оформлена", body: "Jog #12 → Андрей К.", when: "22 мин назад", tone: "green" },
    { title: "Рейтинг клиента изменён", body: "Игорь В. 72 → 45", when: "1 ч назад", tone: "orange" },
    { title: "Автоштраф за просрочку", body: "200 ₽ по аренде А-121", when: "2 ч назад", tone: "red" },
    { title: "Новая заявка", body: "Tank для курьерской работы", when: "3 ч назад", tone: "blue" }
  ];

  HB_DATA.clients = [
    { id: 1, name: "Абдуллаев Руслан", phone: "+7 (964) 123-45-67", rating: 82, rents: 2, debt: 0, source: "avito", added: "03.04.26" },
    { id: 2, name: "Белов Максим", phone: "+7 (916) 234-56-78", rating: 91, rents: 1, debt: 0, source: "ref", added: "05.04.26" },
    { id: 3, name: "Волкова Анна", phone: "+7 (926) 345-67-89", rating: 28, rents: 0, debt: 8400, source: "avito", added: "08.04.26" },
    { id: 4, name: "Гусев Дмитрий", phone: "+7 (903) 456-78-90", rating: 75, rents: 1, debt: 0, source: "maps", added: "10.04.26" },
    { id: 5, name: "Данилов Никита", phone: "+7 (925) 567-89-01", rating: 15, rents: 0, debt: 14200, source: "avito", added: "11.04.26", blacklisted: true, comment: "не выходит на связь" },
    { id: 6, name: "Егорова Мария", phone: "+7 (977) 678-90-12", rating: 88, rents: 2, debt: 0, source: "repeat", added: "14.04.26" },
    { id: 7, name: "Жуков Олег", phone: "+7 (906) 789-01-23", rating: 65, rents: 0, debt: 0, source: "avito", added: "16.04.26" },
    { id: 8, name: "Зайцев Антон", phone: "+7 (915) 890-12-34", rating: 94, rents: 1, debt: 0, source: "ref", added: "17.04.26" },
    { id: 9, name: "Иванова Елена", phone: "+7 (985) 901-23-45", rating: 72, rents: 1, debt: 0, source: "avito", added: "18.04.26" },
    { id: 10, name: "Кузнецов Сергей", phone: "+7 (963) 012-34-56", rating: 35, rents: 0, debt: 3200, source: "other", added: "20.04.26" },
    { id: 11, name: "Лапин Виктор", phone: "+7 (917) 123-45-78", rating: 80, rents: 1, debt: 0, source: "repeat", added: "22.04.26" },
    { id: 12, name: "Макаров Илья", phone: "+7 (999) 234-56-89", rating: 22, rents: 0, debt: 0, source: "avito", added: "24.04.26", blacklisted: true, comment: "повредил скутер #12, не платил" },
    { id: 13, name: "Новикова Ольга", phone: "+7 (965) 345-67-90", rating: 86, rents: 0, debt: 0, source: "maps", added: "26.04.26" },
    { id: 14, name: "Орлов Павел", phone: "+7 (901) 456-78-01", rating: 70, rents: 1, debt: 0, source: "ref", added: "28.04.26" },
    { id: 15, name: "Петрова Ирина", phone: "+7 (919) 567-89-12", rating: 68, rents: 0, debt: 0, source: "avito", added: "01.05.26" },
    { id: 16, name: "Рубцов Кирилл", phone: "+7 (968) 678-90-23", rating: 45, rents: 0, debt: 5600, source: "avito", added: "03.05.26" },
    { id: 17, name: "Соколова Татьяна", phone: "+7 (929) 789-01-34", rating: 92, rents: 2, debt: 0, source: "repeat", added: "05.05.26", comment: "VIP" },
    { id: 18, name: "Тимофеев Андрей", phone: "+7 (910) 890-12-45", rating: 60, rents: 0, debt: 0, source: "other", added: "07.05.26" },
    { id: 19, name: "Ульянов Борис", phone: "+7 (926) 901-23-56", rating: 84, rents: 1, debt: 0, source: "avito", added: "09.05.26" },
    { id: 20, name: "Фролов Михаил", phone: "+7 (967) 012-34-67", rating: 55, rents: 0, debt: 0, source: "maps", added: "11.05.26" },
    { id: 21, name: "Харитонов Николай", phone: "+7 (977) 123-45-89", rating: 38, rents: 0, debt: 2100, source: "avito", added: "13.05.26" },
    { id: 22, name: "Цветкова Юлия", phone: "+7 (903) 234-56-91", rating: 77, rents: 1, debt: 0, source: "ref", added: "15.05.26" },
    { id: 23, name: "Чернов Роман", phone: "+7 (964) 345-67-02", rating: 18, rents: 0, debt: 19800, source: "other", added: "17.05.26", blacklisted: true, comment: "исчез после аванса" },
    { id: 24, name: "Шульц Артём", phone: "+7 (925) 456-78-13", rating: 74, rents: 1, debt: 0, source: "repeat", added: "19.05.26" },
    { id: 25, name: "Щербаков Глеб", phone: "+7 (916) 567-89-24", rating: 62, rents: 0, debt: 0, source: "avito", added: "21.05.26" },
    { id: 26, name: "Юдина Вера", phone: "+7 (906) 678-90-35", rating: 95, rents: 2, debt: 0, source: "ref", added: "23.05.26" },
    { id: 27, name: "Ясин Артур", phone: "+7 (917) 789-01-46", rating: 50, rents: 0, debt: 0, source: "avito", added: "25.05.26" },
    { id: 28, name: "Аксёнов Виталий", phone: "+7 (985) 890-12-57", rating: 32, rents: 0, debt: 4500, source: "avito", added: "27.05.26" },
    { id: 29, name: "Бирюков Степан", phone: "+7 (963) 901-23-68", rating: 81, rents: 1, debt: 0, source: "maps", added: "29.05.26" },
    { id: 30, name: "Валиев Тимур", phone: "+7 (999) 012-34-79", rating: 25, rents: 0, debt: 11500, source: "avito", added: "01.06.26", blacklisted: true, comment: "судится за депозит" },
    { id: 31, name: "Герасимова Алла", phone: "+7 (915) 123-45-80", rating: 78, rents: 1, debt: 0, source: "ref", added: "03.06.26" },
    { id: 32, name: "Доронин Леонид", phone: "+7 (977) 234-56-01", rating: 66, rents: 0, debt: 0, source: "repeat", added: "05.06.26" },
    { id: 33, name: "Ефимов Владислав", phone: "+7 (968) 345-67-12", rating: 42, rents: 0, debt: 1800, source: "avito", added: "07.06.26" },
    { id: 34, name: "Золотарёва Светлана", phone: "+7 (926) 456-78-23", rating: 89, rents: 2, debt: 0, source: "repeat", added: "09.06.26" },
    { id: 35, name: "Исаков Константин", phone: "+7 (903) 567-89-34", rating: 58, rents: 0, debt: 0, source: "maps", added: "11.06.26" },
    { id: 36, name: "Колесников Евгений", phone: "+7 (925) 678-90-45", rating: 73, rents: 1, debt: 0, source: "avito", added: "13.06.26" },
    { id: 37, name: "Лаврентьев Игорь", phone: "+7 (910) 789-01-56", rating: 48, rents: 0, debt: 0, source: "other", added: "15.06.26" },
    { id: 38, name: "Мельник Яков", phone: "+7 (919) 890-12-67", rating: 83, rents: 1, debt: 0, source: "ref", added: "17.06.26" },
    { id: 39, name: "Никонов Денис", phone: "+7 (964) 901-23-78", rating: 30, rents: 0, debt: 6900, source: "avito", added: "19.06.26" },
    { id: 40, name: "Осипова Дарья", phone: "+7 (965) 012-34-89", rating: 87, rents: 1, debt: 0, source: "repeat", added: "21.06.26" },
    { id: 41, name: "Потапов Григорий", phone: "+7 (906) 123-45-00", rating: 52, rents: 0, debt: 0, source: "avito", added: "23.06.26" },
    { id: 42, name: "Романов Фёдор", phone: "+7 (917) 234-56-11", rating: 71, rents: 1, debt: 0, source: "maps", added: "25.06.26" },
    { id: 43, name: "Савельев Арсений", phone: "+7 (985) 345-67-22", rating: 90, rents: 0, debt: 0, source: "ref", added: "27.06.26" },
    { id: 44, name: "Токарев Вадим", phone: "+7 (999) 456-78-33", rating: 68, rents: 0, debt: 0, source: "avito", added: "29.06.26" }
  ];

  HB_DATA.fleet = [
    { id: 1, name: "Jog #01", model: "jog", mileage: 9450, baseStatus: "ready" },
    { id: 2, name: "Jog #02", model: "jog", mileage: 12100, baseStatus: "ready" },
    { id: 3, name: "Jog #03", model: "jog", mileage: 7800, baseStatus: "ready" },
    { id: 4, name: "Jog #04", model: "jog", mileage: 18400, baseStatus: "repair", note: "замена ЦПГ, ожидается поршневая" },
    { id: 5, name: "Jog #05", model: "jog", mileage: 6320, baseStatus: "ready" },
    { id: 6, name: "Jog #06", model: "jog", mileage: 11250, baseStatus: "ready" },
    { id: 7, name: "Jog #07", model: "jog", mileage: 4120, baseStatus: "ready" },
    { id: 8, name: "Jog #08", model: "jog", mileage: 8840, baseStatus: "ready" },
    { id: 9, name: "Jog #09", model: "jog", mileage: 14700, baseStatus: "ready" },
    { id: 10, name: "Jog #10", model: "jog", mileage: 5600, baseStatus: "for_sale", note: "после ДТП, косметика — 45 000 ₽" },
    { id: 11, name: "Jog #11", model: "jog", mileage: 10120, baseStatus: "ready" },
    { id: 12, name: "Jog #12", model: "jog", mileage: 22800, baseStatus: "sold", note: "продан 08.2026" },
    { id: 13, name: "Jog #13", model: "jog", mileage: 13450, baseStatus: "ready" },
    { id: 14, name: "Jog #14", model: "jog", mileage: 7700, baseStatus: "ready" },
    { id: 15, name: "Jog #15", model: "jog", mileage: 9100, baseStatus: "buyout", note: "выкуп в рассрочку, клиент #29" },
    { id: 16, name: "Jog #16", model: "jog", mileage: 15600, baseStatus: "ready" },
    { id: 17, name: "Jog #17", model: "jog", mileage: 8250, baseStatus: "ready" },
    { id: 18, name: "Jog #18", model: "jog", mileage: 11900, baseStatus: "ready" },
    { id: 19, name: "Jog #19", model: "jog", mileage: 3400, baseStatus: "ready" },
    { id: 20, name: "Jog #20", model: "jog", mileage: 17800, baseStatus: "ready" },
    { id: 21, name: "Jog #21", model: "jog", mileage: 6950, baseStatus: "ready" },
    { id: 22, name: "Jog #22", model: "jog", mileage: 10400, baseStatus: "ready" },
    { id: 23, name: "Jog #23", model: "jog", mileage: 8100, baseStatus: "ready" },
    { id: 24, name: "Jog #24", model: "jog", mileage: 12500, baseStatus: "ready" },
    { id: 25, name: "Jog #25", model: "jog", mileage: 9980, baseStatus: "ready" },
    { id: 26, name: "Jog #26", model: "jog", mileage: 5800, baseStatus: "for_sale", note: "сильный пробег, цена 68 000 ₽" },
    { id: 27, name: "Jog #27", model: "jog", mileage: 13150, baseStatus: "ready" },
    { id: 28, name: "Jog #28", model: "jog", mileage: 7050, baseStatus: "ready" },
    { id: 29, name: "Jog #29", model: "jog", mileage: 14000, baseStatus: "ready" },
    { id: 30, name: "Jog #30", model: "jog", mileage: 6700, baseStatus: "ready" },
    { id: 31, name: "Gear #01", model: "gear", mileage: 11450, baseStatus: "ready" },
    { id: 32, name: "Gear #02", model: "gear", mileage: 16800, baseStatus: "ready" },
    { id: 33, name: "Gear #03", model: "gear", mileage: 9900, baseStatus: "ready" },
    { id: 34, name: "Gear #04", model: "gear", mileage: 13200, baseStatus: "ready" },
    { id: 35, name: "Gear #05", model: "gear", mileage: 21400, baseStatus: "repair", note: "ТО, замена ремня" },
    { id: 36, name: "Gear #06", model: "gear", mileage: 18500, baseStatus: "ready" },
    { id: 37, name: "Gear #07", model: "gear", mileage: 8250, baseStatus: "ready" },
    { id: 38, name: "Gear #08", model: "gear", mileage: 12050, baseStatus: "ready" },
    { id: 39, name: "Gear #09", model: "gear", mileage: 14800, baseStatus: "ready" },
    { id: 40, name: "Gear #10", model: "gear", mileage: 7400, baseStatus: "for_sale", note: "свежая, цена 89 000 ₽" },
    { id: 41, name: "Gear #11", model: "gear", mileage: 10900, baseStatus: "ready" },
    { id: 42, name: "Gear #12", model: "gear", mileage: 13600, baseStatus: "ready" },
    { id: 43, name: "Gear #13", model: "gear", mileage: 15200, baseStatus: "ready" },
    { id: 44, name: "Gear #14", model: "gear", mileage: 9800, baseStatus: "ready" },
    { id: 45, name: "Gear #15", model: "gear", mileage: 6700, baseStatus: "ready" },
    { id: 46, name: "Gear #16", model: "gear", mileage: 11100, baseStatus: "buyout", note: "выкуп в рассрочку, клиент #37" },
    { id: 47, name: "Gear #17", model: "gear", mileage: 8900, baseStatus: "ready" },
    { id: 48, name: "Gear #18", model: "gear", mileage: 12300, baseStatus: "ready" },
    { id: 49, name: "Tank #01", model: "tank", mileage: 24500, baseStatus: "ready" },
    { id: 50, name: "Tank #02", model: "tank", mileage: 19800, baseStatus: "ready" },
    { id: 51, name: "Tank #03", model: "tank", mileage: 31200, baseStatus: "repair", note: "карбюратор после бездорожья" },
    { id: 52, name: "Tank #04", model: "tank", mileage: 17600, baseStatus: "ready" },
    { id: 53, name: "Tank #05", model: "tank", mileage: 22900, baseStatus: "ready" },
    { id: 54, name: "Tank #06", model: "tank", mileage: 14300, baseStatus: "ready" }
  ];

  HB_DATA.rentals = [
    { id: 101, clientId: 17, scooter: "Jog #07", scooterId: 7, model: "jog", start: "14.09.2026", endPlanned: "14.10.2026", status: "active", tariffPeriod: "month", rate: 400, days: 30, sum: 12000, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 102, clientId: 17, scooter: "Jog #23", scooterId: 23, model: "jog", start: "01.10.2026", endPlanned: "31.10.2026", status: "active", tariffPeriod: "month", rate: 400, days: 30, sum: 12000, deposit: 2000, paymentMethod: "card", equipment: ["шлем", "держатель"] },
    { id: 103, clientId: 1, scooter: "Jog #02", scooterId: 2, model: "jog", start: "05.10.2026", endPlanned: "19.10.2026", status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "cash", equipment: ["шлем"] },
    { id: 104, clientId: 1, scooter: "Jog #11", scooterId: 11, model: "jog", start: "12.10.2026", endPlanned: "15.10.2026", status: "active", tariffPeriod: "short", rate: 600, days: 3, sum: 1800, deposit: 2000, paymentMethod: "cash", equipment: [] },
    { id: 105, clientId: 2, scooter: "Gear #04", scooterId: 34, model: "gear", start: "01.10.2026", endPlanned: "31.10.2026", status: "active", tariffPeriod: "month", rate: 500, days: 30, sum: 15000, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 106, clientId: 4, scooter: "Jog #17", scooterId: 17, model: "jog", start: "28.09.2026", endPlanned: "28.10.2026", status: "active", tariffPeriod: "month", rate: 400, days: 30, sum: 12000, deposit: 2000, paymentMethod: "card", equipment: ["шлем", "держатель"] },
    { id: 107, clientId: 6, scooter: "Gear #09", scooterId: 39, model: "gear", start: "10.10.2026", endPlanned: "24.10.2026", status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 108, clientId: 6, scooter: "Jog #18", scooterId: 18, model: "jog", start: "02.10.2026", endPlanned: "16.10.2026", status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "cash", equipment: [] },
    { id: 109, clientId: 8, scooter: "Tank #02", scooterId: 50, model: "tank", start: "05.10.2026", endPlanned: "19.10.2026", status: "active", tariffPeriod: "week", rate: 700, days: 14, sum: 9800, deposit: 2000, paymentMethod: "card", equipment: ["шлем", "держатель"] },
    { id: 110, clientId: 9, scooter: "Gear #12", scooterId: 42, model: "gear", start: "08.10.2026", endPlanned: "22.10.2026", status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 111, clientId: 11, scooter: "Jog #05", scooterId: 5, model: "jog", start: "03.10.2026", endPlanned: "17.10.2026", status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "card", equipment: [] },
    { id: 112, clientId: 14, scooter: "Jog #25", scooterId: 25, model: "jog", start: "12.10.2026", endPlanned: "14.10.2026", status: "active", tariffPeriod: "short", rate: 600, days: 2, sum: 1200, deposit: 2000, paymentMethod: "cash", equipment: ["шлем"], note: "тест-драйв на 2 дня" },
    { id: 113, clientId: 19, scooter: "Gear #07", scooterId: 37, model: "gear", start: "06.10.2026", endPlanned: "20.10.2026", status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 114, clientId: 22, scooter: "Jog #14", scooterId: 14, model: "jog", start: "11.10.2026", endPlanned: "18.10.2026", status: "active", tariffPeriod: "week", rate: 500, days: 7, sum: 3500, deposit: 2000, paymentMethod: "cash", equipment: [] },
    { id: 115, clientId: 24, scooter: "Gear #15", scooterId: 45, model: "gear", start: "01.10.2026", endPlanned: "31.10.2026", status: "active", tariffPeriod: "month", rate: 500, days: 30, sum: 15000, deposit: 2000, paymentMethod: "card", equipment: ["шлем", "держатель"] },
    { id: 116, clientId: 26, scooter: "Jog #29", scooterId: 29, model: "jog", start: "04.10.2026", endPlanned: "18.10.2026", status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 117, clientId: 26, scooter: "Tank #04", scooterId: 52, model: "tank", start: "10.10.2026", endPlanned: "17.10.2026", status: "active", tariffPeriod: "week", rate: 700, days: 7, sum: 4900, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 118, clientId: 29, scooter: "Jog #08", scooterId: 8, model: "jog", start: "07.10.2026", endPlanned: "21.10.2026", status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "cash", equipment: [] },
    { id: 119, clientId: 31, scooter: "Gear #03", scooterId: 33, model: "gear", start: "09.10.2026", endPlanned: "23.10.2026", status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 120, clientId: 34, scooter: "Jog #22", scooterId: 22, model: "jog", start: "02.10.2026", endPlanned: "16.10.2026", status: "active", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 121, clientId: 34, scooter: "Gear #18", scooterId: 48, model: "gear", start: "06.10.2026", endPlanned: "13.10.2026", status: "returning", tariffPeriod: "week", rate: 600, days: 7, sum: 4200, deposit: 2000, paymentMethod: "cash", equipment: [], note: "возврат сегодня — нужно встретить" },
    { id: 122, clientId: 36, scooter: "Jog #30", scooterId: 30, model: "jog", start: "08.10.2026", endPlanned: "15.10.2026", status: "active", tariffPeriod: "week", rate: 500, days: 7, sum: 3500, deposit: 2000, paymentMethod: "card", equipment: [] },
    { id: 123, clientId: 38, scooter: "Tank #01", scooterId: 49, model: "tank", start: "05.10.2026", endPlanned: "19.10.2026", status: "active", tariffPeriod: "week", rate: 700, days: 14, sum: 9800, deposit: 2000, paymentMethod: "card", equipment: ["шлем", "держатель"] },
    { id: 124, clientId: 40, scooter: "Jog #03", scooterId: 3, model: "jog", start: "11.10.2026", endPlanned: "14.10.2026", status: "active", tariffPeriod: "short", rate: 600, days: 3, sum: 1800, deposit: 2000, paymentMethod: "cash", equipment: [] },
    { id: 125, clientId: 42, scooter: "Gear #11", scooterId: 41, model: "gear", start: "01.10.2026", endPlanned: "15.10.2026", status: "active", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000, paymentMethod: "card", equipment: ["шлем"] },
    { id: 130, clientId: 3, scooter: "Jog #04", scooterId: 4, model: "jog", start: "25.09.2026", endPlanned: "09.10.2026", status: "overdue", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "cash", equipment: ["шлем"], note: "просрочен возврат на 4 дня, клиент обещал вернуть завтра" },
    { id: 131, clientId: 16, scooter: "Gear #06", scooterId: 36, model: "gear", start: "20.09.2026", endPlanned: "11.10.2026", status: "overdue", tariffPeriod: "week", rate: 600, days: 21, sum: 12600, deposit: 2000, paymentMethod: "transfer", equipment: [], note: "обещает вернуть после зарплаты" },
    { id: 132, clientId: 21, scooter: "Jog #20", scooterId: 20, model: "jog", start: "29.09.2026", endPlanned: "12.10.2026", status: "overdue", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "cash", equipment: ["шлем"], note: "первый раз пропустил платёж" },
    { id: 133, clientId: 33, scooter: "Jog #13", scooterId: 13, model: "jog", start: "28.09.2026", endPlanned: "12.10.2026", status: "overdue", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "transfer", equipment: [], note: "должен 1800 ₽ до пятницы" },
    { id: 134, clientId: 39, scooter: "Gear #02", scooterId: 32, model: "gear", start: "20.09.2026", endPlanned: "04.10.2026", status: "overdue", tariffPeriod: "week", rate: 600, days: 14, sum: 8400, deposit: 2000, paymentMethod: "cash", equipment: [], note: "пропустил возврат, ссылается на жену" },
    { id: 135, clientId: 28, scooter: "Jog #16", scooterId: 16, model: "jog", start: "22.09.2026", endPlanned: "06.10.2026", status: "overdue", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "cash", equipment: [], note: "просрочка 1 неделя" },
    { id: 140, clientId: 13, scooter: "Gear #01", scooterId: 31, model: "gear", start: "01.10.2026", endPlanned: "13.10.2026", status: "returning", tariffPeriod: "week", rate: 600, days: 12, sum: 7200, deposit: 2000, paymentMethod: "card", equipment: ["шлем"], note: "осмотр 13.10 в 14:00" },
    { id: 150, clientId: 10, scooter: "Jog #12", scooterId: 12, model: "jog", start: "10.04.2026", endPlanned: "20.04.2026", status: "completed_damage", tariffPeriod: "week", rate: 500, days: 13, sum: 6500, deposit: 2000, paymentMethod: "cash", equipment: ["шлем"], note: "вернул на 3 дня позже, штраф 3200 ₽ не погашен", damageAmount: 3200 },
    { id: 160, clientId: 5, scooter: "Jog #12", scooterId: 12, model: "jog", start: "11.04.2026", endPlanned: "25.04.2026", status: "police", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "cash", equipment: ["шлем"], note: "скутер не возвращён, заявление в ОВД 18.04.2026" },
    { id: 170, clientId: 7, scooter: "—", model: "jog", start: "13.10.2026", endPlanned: "—", status: "new_request", tariffPeriod: "week", rate: 0, days: 14, sum: 0, deposit: 0, paymentMethod: "cash", equipment: [], note: "хочет Jog на 2 недели, перезвонить после 18:00" },
    { id: 171, clientId: 18, scooter: "—", model: "tank", start: "13.10.2026", endPlanned: "—", status: "new_request", tariffPeriod: "week", rate: 0, days: 14, sum: 0, deposit: 0, paymentMethod: "cash", equipment: [], note: "интересуется Tank для курьерской работы" },
    { id: 180, clientId: 25, scooter: "Jog #06", scooterId: 6, model: "jog", start: "14.10.2026", endPlanned: "28.10.2026", status: "meeting", tariffPeriod: "week", rate: 500, days: 14, sum: 7000, deposit: 2000, paymentMethod: "card", equipment: ["шлем"], note: "встреча 14.10 в 11:00" },
    { id: 181, clientId: 37, scooter: "Gear #17", scooterId: 47, model: "gear", start: "14.10.2026", endPlanned: "21.10.2026", status: "meeting", tariffPeriod: "week", rate: 600, days: 7, sum: 4200, deposit: 2000, paymentMethod: "cash", equipment: [], note: "встреча 14.10 в 16:30, привезёт паспорт" }
  ];

  HB_DATA.sourceLabel = { avito: "Avito", repeat: "Повторный", ref: "Рекомендация", maps: "Карты", other: "Другое" };
  HB_DATA.modelLabel = { jog: "Yamaha Jog", gear: "Yamaha Gear", tank: "Tank" };

  function parseRuDate(value) {
    if (!value || value === "—") return null;
    var m = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]);
  }

  function initials(name) {
    return String(name || "").split(/\s+/).slice(0, 2).map(function (x) {
      return x.charAt(0);
    }).join("").toUpperCase();
  }

  function fmtMoney(n) {
    return Number(n || 0).toLocaleString("ru-RU") + " ₽";
  }

  function clientById(id) {
    return HB_DATA.clients.find(function (x) { return x.id === id; }) || null;
  }

  function rentalsForClient(clientId) {
    return HB_DATA.rentals.filter(function (x) { return x.clientId === clientId; });
  }

  function rentalById(id) {
    return HB_DATA.rentals.find(function (x) { return x.id === id; }) || null;
  }

  function fleetById(id) {
    return HB_DATA.fleet.find(function (x) { return x.id === id; }) || null;
  }

  function fleetByName(name) {
    return HB_DATA.fleet.find(function (x) { return x.name === name; }) || null;
  }

  function rentalDebt(r) {
    if (!r || r.status !== "overdue") return 0;
    return Math.max(1200, Math.round(r.sum * 0.25));
  }

  function currentRentalForScooter(id) {
    return HB_DATA.rentals.find(function (r) {
      return r.scooterId === id && ["active", "overdue", "returning"].indexOf(r.status) > -1;
    }) || null;
  }

  function displayFleetStatus(item) {
    var rental = currentRentalForScooter(item.id);
    if (rental) return rental.status === "overdue" ? "overdue" : "rented";
    if (item.baseStatus === "repair") return "repair";
    if (item.baseStatus === "for_sale") return "sale";
    if (item.baseStatus === "buyout") return "buyout";
    if (item.baseStatus === "sold") return "sold";
    return "free";
  }

  function activeRentals() {
    return HB_DATA.rentals.filter(function (r) {
      return ["active", "overdue", "returning"].indexOf(r.status) > -1;
    });
  }

  function returnsToday() {
    var snapshot = parseRuDate(HB_DATA.snapshotLabel);
    return activeRentals().filter(function (r) {
      var d = parseRuDate(r.endPlanned);
      return d && Math.abs(Math.round((d - snapshot) / 86400000)) <= 1;
    });
  }

  function overdueRentals() {
    return HB_DATA.rentals.filter(function (r) { return r.status === "overdue"; });
  }

  function applications() {
    return HB_DATA.rentals.filter(function (r) {
      return r.status === "new_request" || r.status === "meeting";
    }).map(function (r) {
      var c = clientById(r.clientId);
      return {
        id: r.id,
        name: c ? c.name : "Новый клиент",
        phone: c ? c.phone : "—",
        source: c ? (HB_DATA.sourceLabel[c.source] || c.source) : "Другое",
        model: HB_DATA.modelLabel[r.model] || r.model,
        days: r.days,
        when: r.status === "new_request" ? "сегодня" : r.start,
        note: r.note || "",
        status: r.status === "new_request" ? "new" : "work"
      };
    });
  }

  function fleetStats() {
    var result = { rented: 0, overdue: 0, free: 0, repair: 0, sale: 0, buyout: 0, sold: 0 };
    HB_DATA.fleet.forEach(function (item) {
      result[displayFleetStatus(item)] += 1;
    });
    return result;
  }

  function modelOilInterval(model) {
    return model === "jog" ? 5000 : 3000;
  }

  function ratingTier(score) {
    if (score >= 80) return { label: "Надёжный", tone: "green" };
    if (score >= 50) return { label: "Средний", tone: "orange" };
    return { label: "Рискованный", tone: "red" };
  }

  HB_DATA.parseRuDate = parseRuDate;
  HB_DATA.initials = initials;
  HB_DATA.fmtMoney = fmtMoney;
  HB_DATA.clientById = clientById;
  HB_DATA.rentalsForClient = rentalsForClient;
  HB_DATA.rentalById = rentalById;
  HB_DATA.fleetById = fleetById;
  HB_DATA.fleetByName = fleetByName;
  HB_DATA.rentalDebt = rentalDebt;
  HB_DATA.currentRentalForScooter = currentRentalForScooter;
  HB_DATA.displayFleetStatus = displayFleetStatus;
  HB_DATA.activeRentals = activeRentals;
  HB_DATA.returnsToday = returnsToday;
  HB_DATA.overdueRentals = overdueRentals;
  HB_DATA.applications = applications;
  HB_DATA.fleetStats = fleetStats;
  HB_DATA.modelOilInterval = modelOilInterval;
  HB_DATA.ratingTier = ratingTier;

  w.HB_DATA = HB_DATA;
})(window);
