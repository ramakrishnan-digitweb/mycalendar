import { DateTime } from 'luxon';
import { cx } from './ui';

interface Props {
  month: DateTime; // any day in the displayed month, in the viewer's zone
  available: Set<string>; // YYYY-MM-DD with at least one slot
  selected: string | null;
  onSelect: (date: string) => void;
  onMonthChange: (month: DateTime) => void;
  canGoBack: boolean;
  loading?: boolean;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MonthCalendar({ month, available, selected, onSelect, onMonthChange, canGoBack, loading }: Props) {
  const first = month.startOf('month');
  const gridStart = first.minus({ days: first.weekday - 1 });
  const days = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
  const weeks = days[35].month === first.month ? 6 : 5;
  const today = DateTime.now().setZone(month.zone).toISODate();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold">{first.toFormat('LLLL yyyy')}</h3>
        <div className="flex gap-1">
          <NavButton label="Previous month" disabled={!canGoBack} onClick={() => onMonthChange(first.minus({ months: 1 }))}>
            ‹
          </NavButton>
          <NavButton label="Next month" onClick={() => onMonthChange(first.plus({ months: 1 }))}>
            ›
          </NavButton>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-stone-500">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className={cx('grid grid-cols-7 gap-1', loading && 'animate-pulse opacity-60')}>
        {days.slice(0, weeks * 7).map((day) => {
          const iso = day.toISODate()!;
          const inMonth = day.month === first.month;
          const isAvailable = inMonth && available.has(iso);
          const isSelected = iso === selected;
          return (
            <button
              key={iso}
              type="button"
              disabled={!isAvailable}
              onClick={() => onSelect(iso)}
              aria-pressed={isSelected}
              aria-label={day.toFormat('cccc d LLLL') + (isAvailable ? ', available' : '')}
              className={cx(
                'relative aspect-square rounded-full text-sm transition-colors',
                !inMonth && 'invisible',
                isSelected && 'bg-teal-700 font-semibold text-white',
                !isSelected && isAvailable && 'bg-teal-50 font-semibold text-teal-800 hover:bg-teal-100',
                !isAvailable && 'cursor-default text-stone-300',
              )}
            >
              {day.day}
              {iso === today && (
                <span
                  className={cx(
                    'absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full',
                    isSelected ? 'bg-white' : 'bg-teal-700',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full text-lg text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
