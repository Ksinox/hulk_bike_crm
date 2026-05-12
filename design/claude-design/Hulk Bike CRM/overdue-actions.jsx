/* Overdue actions popover — appears when user clicks an overdue (red) day on the calendar,
   or the overdue chip. Lets operator: forgive 1 day, forgive all, accept payment, mark no-charge. */

function OverdueActions({ rental, onClose, onAction }) {
  const dailyCost = rental.tariff.rate;
  const debt = rental.debt;
  return (
    <div className="w-full flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-[var(--red-soft)] text-[var(--red-ink)] flex items-center justify-center">
            <I.AlertTri size={13} />
          </div>
          <div>
            <div className="text-[12.5px] font-bold text-[var(--ink)]">Просрочка {rental.overdueDays} дн</div>
            <div className="text-[10.5px] text-[var(--muted)]">{fmtMoney(debt)} ₽ долга по {fmtMoney(dailyCost)} ₽/сут</div>
          </div>
        </div>
      </div>
      <div className="py-1.5">
        <ActionRow icon={I.Wallet} title="Принять оплату" subtitle={`${fmtMoney(debt)} ₽ — погасить весь долг`} tone="primary" onClick={() => onAction('pay-all')} />
        <ActionRow icon={I.Wave} title="Простить 1 день" subtitle={`−${fmtMoney(dailyCost)} ₽ из долга, без обоснования`} onClick={() => onAction('forgive-one')} />
        <ActionRow icon={I.Gift} title="Простить всю просрочку" subtitle={`−${fmtMoney(debt)} ₽ — обнулить долг`} tone="warn" onClick={() => onAction('forgive-all')} />
        <ActionRow icon={I.Stop} title="Не учитывать просрочку" subtitle="Пауза начислений — нужна причина" onClick={() => onAction('pause')} />
      </div>
    </div>
  );
}

function ActionRow({ icon: IconC, title, subtitle, tone, onClick }) {
  const toneCls = tone === 'primary'
    ? 'text-[var(--blue-700)] hover:bg-[var(--blue-50)]'
    : tone === 'warn'
      ? 'text-[var(--orange-ink)] hover:bg-[var(--orange-soft)]/40'
      : 'text-[var(--ink-2)] hover:bg-[var(--surface-soft)]';
  return (
    <button onClick={onClick} className={`w-full flex items-start gap-2.5 px-3 py-2 text-left ${toneCls}`}>
      <IconC size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold">{title}</div>
        <div className="text-[10.5px] text-[var(--muted)] mt-0.5">{subtitle}</div>
      </div>
      <I.ChevronR size={12} className="mt-1 text-[var(--muted-2)]" />
    </button>
  );
}

window.OverdueActions = OverdueActions;
