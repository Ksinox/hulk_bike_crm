/**
 * v0.8 — Конечный автомат стадий долга.
 *
 * Каждый тип долга имеет свой граф переходов. Этот модуль —
 * единственная точка правды о том, какие переходы разрешены.
 * routes/debtors.ts валидирует POST /transition через canTransition().
 *
 * Зеркалится на фронте в apps/web/src/lib/debtors/stages.ts —
 * UI рисует доступные ветки в дереве и кнопки решений.
 */

export type DebtType =
  | "dtp_guilty"
  | "dtp_victim"
  | "damage"
  | "theft"
  | "rental_overdue";

export type Stage =
  | "created"
  | "pretrial"
  | "lawyer"
  | "court"
  | "insurance_docs"
  | "insurance_eval"
  | "insurance_wait"
  | "payment_schedule"
  | "police"
  | "criminal_case"
  | "closed_paid"
  | "closed_recovered"
  | "closed_written_off"
  | "closed_settled"
  | "closed_court";

export type Transition = {
  to: Stage;
  /** Что показать на кнопке решения в UI. */
  label: string;
  /** Описание действия для подсказки/тултипа. */
  hint?: string;
  /** Главный ход (рекомендуемый по бизнес-логике) — рисуется крупной кнопкой. */
  primary?: boolean;
};

/**
 * Полная карта переходов. Ключ — текущая стадия, значение — массив
 * возможных переходов (с лейблами для UI).
 */
/**
 * Карта переходов. Закрытие «оплачено» (closed_paid) присутствует в дереве
 * payment_schedule для валидации, но в UI кнопкой НЕ рисуется — оно
 * происходит автоматически при полном погашении (или кнопкой «Закрыть —
 * долг погашен» при нулевом остатке), а гард в routes блокирует его, пока
 * долг не покрыт. Прочие закрытия (recovered/settled/court/written_off) —
 * НЕ требуют денег: это управленческие исходы (скутер вернулся, мировая,
 * суд, списание). Каждая активная стадия имеет не-денежный выход — тупиков нет.
 */
const TRANSITIONS: Record<DebtType, Partial<Record<Stage, Transition[]>>> = {
  dtp_guilty: {
    created: [
      { to: "pretrial", label: "Начать досудебку", primary: true },
      { to: "closed_settled", label: "Договорились — мировая" },
      { to: "closed_written_off", label: "Списать долг" },
    ],
    pretrial: [
      { to: "payment_schedule", label: "Признал — создать график", primary: true },
      { to: "lawyer", label: "Не признал — юристу" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Юрист убедил — создать график", primary: true },
      { to: "court", label: "Подать в суд" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда — закрыть", primary: true },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    payment_schedule: [
      { to: "closed_paid", label: "Долг погашен" },
      { to: "lawyer", label: "Перестал платить — к юристу" },
      { to: "closed_written_off", label: "Списать остаток" },
    ],
  },

  dtp_victim: {
    created: [
      { to: "insurance_docs", label: "Подать документы в страховую", primary: true },
      { to: "closed_written_off", label: "Не обращаемся — закрыть" },
    ],
    insurance_docs: [
      { to: "insurance_eval", label: "Оценка назначена", primary: true },
      { to: "closed_written_off", label: "Отказ страховой — списать" },
    ],
    insurance_eval: [
      { to: "insurance_wait", label: "Оценка получена — ждём выплату", primary: true },
      { to: "lawyer", label: "Спор со страховой — юристу" },
      { to: "closed_written_off", label: "Отказ — списать" },
    ],
    insurance_wait: [
      { to: "closed_paid", label: "Выплата получена — закрыть", primary: true },
      { to: "lawyer", label: "Занизили выплату — юристу" },
      { to: "closed_written_off", label: "Отказ — списать" },
    ],
    lawyer: [
      { to: "court", label: "В суд на страховую", primary: true },
      { to: "closed_settled", label: "Урегулировали — мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда — закрыть", primary: true },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },

  damage: {
    created: [
      { to: "payment_schedule", label: "Создать график платежей", primary: true },
      { to: "closed_settled", label: "Договорились — мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    payment_schedule: [
      { to: "closed_paid", label: "Долг погашен" },
      { to: "lawyer", label: "Систематические нарушения — к юристу" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать остаток" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Возобновить график", primary: true },
      { to: "court", label: "Подать в суд" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда — закрыть", primary: true },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },

  theft: {
    created: [
      { to: "pretrial", label: "Связаться с клиентом", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "police", label: "Заявление в полицию" },
      { to: "closed_written_off", label: "Списать (скутер потерян)" },
    ],
    pretrial: [
      { to: "payment_schedule", label: "Согласен выкупить — график", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "police", label: "Не признал — полиция" },
      { to: "closed_written_off", label: "Списать" },
    ],
    payment_schedule: [
      { to: "closed_paid", label: "Выкуп оплачен" },
      { to: "closed_recovered", label: "Скутер вернулся — закрыть" },
      { to: "lawyer", label: "Перестал платить — юристу" },
      { to: "closed_written_off", label: "Списать остаток" },
    ],
    police: [
      { to: "criminal_case", label: "Возбуждено уголовное дело", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "closed_settled", label: "Договорились — мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
    criminal_case: [
      { to: "closed_court", label: "Приговор — закрыть", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "closed_written_off", label: "Не нашли — списать" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Возобновить выкуп", primary: true },
      { to: "court", label: "Подать в суд" },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "closed_written_off", label: "Списать" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда — закрыть", primary: true },
      { to: "closed_recovered", label: "Скутер вернулся" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },

  rental_overdue: {
    created: [
      { to: "payment_schedule", label: "Создать график погашения", primary: true },
      { to: "closed_settled", label: "Договорились — мировая" },
      { to: "closed_written_off", label: "Списать долг" },
    ],
    payment_schedule: [
      { to: "closed_paid", label: "Долг погашен" },
      { to: "lawyer", label: "Систематические нарушения — к юристу" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать остаток" },
    ],
    lawyer: [
      { to: "payment_schedule", label: "Возобновить график", primary: true },
      { to: "court", label: "Подать в суд" },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать долг" },
    ],
    court: [
      { to: "closed_court", label: "Решение суда — закрыть", primary: true },
      { to: "closed_settled", label: "Мировая" },
      { to: "closed_written_off", label: "Списать" },
    ],
  },
};

/** Возможные следующие стадии для (type, stage). */
export function nextStages(type: DebtType, stage: Stage): Transition[] {
  return TRANSITIONS[type]?.[stage] ?? [];
}

/** Разрешён ли переход type:from→to? */
export function canTransition(
  type: DebtType,
  from: Stage,
  to: Stage,
): boolean {
  return nextStages(type, from).some((t) => t.to === to);
}

/** Финальные стадии — дело закрыто. */
export function isClosed(stage: Stage): boolean {
  return stage.startsWith("closed_");
}

/**
 * Тупиковая стадия без выходов — дело длится бесконечно (уголовка,
 * иногда criminal_case). Не закрыта, но из неё некуда переходить
 * без внешнего события.
 */
export function isTerminal(type: DebtType, stage: Stage): boolean {
  if (isClosed(stage)) return true;
  return nextStages(type, stage).length === 0;
}

/** Рекомендуемый (primary) следующий ход — для главной кнопки на UI. */
export function primaryTransition(
  type: DebtType,
  stage: Stage,
): Transition | null {
  return nextStages(type, stage).find((t) => t.primary) ?? null;
}

/** Все возможные стадии для типа долга (для отрисовки дерева). */
export function allStagesForType(type: DebtType): Stage[] {
  const seen = new Set<Stage>(["created"]);
  const queue: Stage[] = ["created"];
  while (queue.length) {
    const s = queue.shift()!;
    for (const t of nextStages(type, s)) {
      if (!seen.has(t.to)) {
        seen.add(t.to);
        queue.push(t.to);
      }
    }
  }
  return [...seen];
}

/**
 * Человекочитаемый лейбл стадии (для UI и activity log).
 */
export function stageLabel(stage: Stage): string {
  const labels: Record<Stage, string> = {
    created: "Заведено",
    pretrial: "Досудебка",
    lawyer: "У юриста",
    court: "В суде",
    insurance_docs: "Документы в страховой",
    insurance_eval: "Оценка",
    insurance_wait: "Ждём выплату",
    payment_schedule: "График платежей",
    police: "Заявление в полицию",
    criminal_case: "Уголовное дело",
    closed_paid: "Закрыто оплатой",
    closed_recovered: "Имущество возвращено",
    closed_written_off: "Списано",
    closed_settled: "Мировая",
    closed_court: "Закрыто решением суда",
  };
  return labels[stage];
}

export function typeLabel(type: DebtType): string {
  const labels: Record<DebtType, string> = {
    dtp_guilty: "ДТП · виновник",
    dtp_victim: "ДТП · потерпевший",
    damage: "Ущерб",
    theft: "Угон",
    rental_overdue: "Просрочка аренды",
  };
  return labels[type];
}
