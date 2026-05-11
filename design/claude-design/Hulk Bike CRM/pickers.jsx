/* Inline scooter swap picker — popover showing available alternatives.
   Inline equipment swap picker — replace one item with another from catalog. */

function ScooterSwapPicker({ currentId, onSelect, onClose }) {
  const [filter, setFilter] = React.useState('');
  const available = PARK.filter(s => s.status === 'available');
  const items = available.filter(s => (s.number + ' ' + s.model).toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-2)] mb-1.5">
          Доступные скутеры · {available.length}
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
               placeholder="Поиск по номеру или модели…"
               className="h-8 w-full rounded-[8px] border border-[var(--border)] bg-white px-2.5 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--blue-600)]" />
      </div>
      <div className="max-h-[280px] overflow-y-auto scrollbar-thin px-1.5 pb-2">
        {items.length === 0 && (
          <div className="px-3 py-4 text-center text-[12px] text-[var(--muted-2)]">Не найдено</div>
        )}
        {items.map(s => (
          <button key={s.id} onClick={() => { onSelect(s); onClose(); }}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-[10px] hover:bg-[var(--blue-50)] text-left">
            <ScooterPoster scooter={s} size={36} />
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-semibold text-[var(--ink)]">{s.number}</div>
              <div className="text-[10.5px] text-[var(--muted)]">{s.model} · {fmtMoney(s.mileage)} км</div>
            </div>
            <div className="text-[11px] font-semibold text-[var(--blue-700)] tnum">{s.rate} ₽</div>
          </button>
        ))}
      </div>
      <div className="border-t border-[var(--border)] px-3 py-2 bg-[var(--surface-soft)] text-[10.5px] text-[var(--muted)]">
        Замена не меняет цену, кроме случаев перехода на другую модель.
      </div>
    </div>
  );
}

function EquipmentSwapPicker({ replacing, onSelect, onRemove, onClose }) {
  const [filter, setFilter] = React.useState('');
  const groups = ['Защита','Погода','Аксессуары'];
  const items = EQUIPMENT_CATALOG.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-2)]">
          Заменить «{replacing.name}»
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
               placeholder="Найти…"
               className="mt-2 h-8 w-full rounded-[8px] border border-[var(--border)] bg-white px-2.5 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--blue-600)]" />
      </div>
      <div className="max-h-[260px] overflow-y-auto scrollbar-thin px-1.5 py-1.5">
        {groups.map(g => {
          const gItems = items.filter(i => i.group === g && i.id !== replacing.itemId);
          if (gItems.length === 0) return null;
          return (
            <div key={g} className="mb-1.5">
              <div className="px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider text-[var(--muted-2)]">{g}</div>
              {gItems.map(it => (
                <button key={it.id} onClick={() => { onSelect(it); onClose(); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] hover:bg-[var(--blue-50)] text-left">
                  <span className="flex-1 text-[12px] text-[var(--ink-2)]">{it.name}</span>
                  {it.free
                    ? <span className="text-[10px] font-bold text-[var(--green-ink)]">бесплатно</span>
                    : <span className="text-[10.5px] font-semibold text-[var(--orange-ink)] tnum">+{it.price} ₽/сут</span>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      <div className="border-t border-[var(--border)] px-3 py-2 bg-[var(--surface-soft)] flex items-center justify-between">
        <button onClick={() => { onRemove(); onClose(); }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--red-ink)] hover:underline">
          <I.Trash size={11} /> Убрать
        </button>
        <span className="text-[10.5px] text-[var(--muted-2)]">пересчёт за остаток дней</span>
      </div>
    </div>
  );
}

function EquipmentAddPicker({ existingIds, onAdd, onClose }) {
  const [filter, setFilter] = React.useState('');
  const groups = ['Защита','Погода','Аксессуары'];
  const items = EQUIPMENT_CATALOG.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) && !existingIds.includes(c.id));
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-[var(--border)]">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-2)]">Добавить экипировку</div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)}
               placeholder="Найти…"
               className="mt-2 h-8 w-full rounded-[8px] border border-[var(--border)] bg-white px-2.5 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--blue-600)]" />
      </div>
      <div className="max-h-[260px] overflow-y-auto scrollbar-thin px-1.5 py-1.5">
        {groups.map(g => {
          const gItems = items.filter(i => i.group === g);
          if (gItems.length === 0) return null;
          return (
            <div key={g} className="mb-1.5">
              <div className="px-2 py-1 text-[9.5px] font-bold uppercase tracking-wider text-[var(--muted-2)]">{g}</div>
              {gItems.map(it => (
                <button key={it.id} onClick={() => { onAdd(it); onClose(); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] hover:bg-[var(--blue-50)] text-left">
                  <I.Plus size={11} className="text-[var(--blue-600)]" />
                  <span className="flex-1 text-[12px] text-[var(--ink-2)]">{it.name}</span>
                  {it.free
                    ? <span className="text-[10px] font-bold text-[var(--green-ink)]">бесплатно</span>
                    : <span className="text-[10.5px] font-semibold text-[var(--orange-ink)] tnum">+{it.price} ₽/сут</span>}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.ScooterSwapPicker = ScooterSwapPicker;
window.EquipmentSwapPicker = EquipmentSwapPicker;
window.EquipmentAddPicker = EquipmentAddPicker;
