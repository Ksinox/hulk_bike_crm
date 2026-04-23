/**
 * Сиды для каталогов моделей и экипировки.
 *
 * Запускается отдельно: `pnpm --filter api db:seed:catalogs`.
 * Идемпотентен: если запись с таким `name` уже есть — пропускаем.
 *
 * Содержит стартовые данные, владелец сможет удалить/отредактировать в UI.
 */
import { db } from "../db/index.js";
import { scooterModels, equipmentItems } from "../db/schema.js";
import { eq } from "drizzle-orm";

const DEFAULT_MODELS: {
  name: string;
  quickPick: boolean;
  shortRate: number;
  weekRate: number;
  monthRate: number;
  note?: string;
}[] = [
  {
    name: "Yamaha Jog",
    quickPick: true,
    shortRate: 1300,
    weekRate: 450,
    monthRate: 400,
  },
  {
    name: "Yamaha Gear",
    quickPick: true,
    shortRate: 1300,
    weekRate: 550,
    monthRate: 500,
  },
  {
    name: "Honda Dio",
    quickPick: true,
    shortRate: 1300,
    weekRate: 500,
    monthRate: 450,
  },
  {
    name: "Tank T150",
    quickPick: true,
    shortRate: 1300,
    weekRate: 600,
    monthRate: 550,
  },
];

const DEFAULT_EQUIPMENT: {
  name: string;
  quickPick: boolean;
  isFree: boolean;
  price: number;
}[] = [
  { name: "Шлем", quickPick: true, isFree: true, price: 0 },
  { name: "Держатель телефона", quickPick: true, isFree: true, price: 0 },
  { name: "Цепь", quickPick: true, isFree: true, price: 0 },
  { name: "Багажник", quickPick: true, isFree: true, price: 0 },
  { name: "Термокороб", quickPick: true, isFree: true, price: 0 },
];

async function seedCatalogs() {
  let modelsAdded = 0;
  for (const m of DEFAULT_MODELS) {
    const [existing] = await db
      .select({ id: scooterModels.id })
      .from(scooterModels)
      .where(eq(scooterModels.name, m.name));
    if (existing) continue;
    await db.insert(scooterModels).values(m);
    modelsAdded++;
  }

  let equipAdded = 0;
  for (const e of DEFAULT_EQUIPMENT) {
    const [existing] = await db
      .select({ id: equipmentItems.id })
      .from(equipmentItems)
      .where(eq(equipmentItems.name, e.name));
    if (existing) continue;
    await db.insert(equipmentItems).values(e);
    equipAdded++;
  }

  console.log(
    `[seed:catalogs] models: +${modelsAdded}, equipment: +${equipAdded}`,
  );
}

seedCatalogs()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
