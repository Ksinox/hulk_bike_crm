/* App root + Tweaks panel wiring */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "scenario": "overdue",
  "compact": false,
  "calendarStyle": "rounded"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const initial = t.scenario === 'overdue' ? RENTAL_OVERDUE : RENTAL_BASE;
  const [key, setKey] = React.useState(0);
  React.useEffect(() => { setKey(k => k + 1); }, [t.scenario]);

  return (
    <div className="min-h-screen w-full">
      <RentalCard key={key} initialRental={JSON.parse(JSON.stringify(initial))} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Сценарий">
          <TweakRadio
            label="Состояние аренды"
            value={t.scenario}
            options={['active','overdue']}
            onChange={(v) => setTweak('scenario', v)}
          />
        </TweakSection>
        <TweakSection label="Подсказка">
          <div className="text-[11.5px] leading-relaxed text-[var(--muted)]">
            <p className="mb-1.5"><b className="text-[var(--ink-2)]">Драг календаря:</b> тяните за синюю ручку справа от даты возврата вправо — появится зелёная зона продления и плашка с суммой. Отпустите — откроется окно «Продление с оплатой».</p>
            <p className="mb-1.5"><b className="text-[var(--ink-2)]">Замена экипировки:</b> кликните по чипу экипировки в карточке — выпадет список альтернатив.</p>
            <p className="mb-1.5"><b className="text-[var(--ink-2)]">Замена скутера:</b> кнопка «Заменить» в карточке скутера или в action-баре.</p>
            <p><b className="text-[var(--ink-2)]">Просрочка:</b> переключите сценарий выше — в баре появится красная кнопка просрочки с быстрыми действиями (простить / принять / пауза).</p>
          </div>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
