import { Button } from '@astryxdesign/core/Button';
import { useCalendarDays, useCalendarNavigation, type ISODateString } from '@astryxdesign/core/Calendar';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './HistoryCalendar.css';

interface HistoryCalendarProps {
  /** 最初に表示する月に含まれる日付（YYYY-MM-DD） */
  initialDate: string;
  /** ワークアウトがある日（YYYY-MM-DD）。印を付ける（REQ-3.6）。 */
  workoutDates: ReadonlySet<string>;
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

/**
 * 月表示のカレンダー。日付の計算と月の移動は Astryx のフックを使い、
 * 日付マス（印・44px 以上のタップ領域）は自作する（Astryx の Calendar には日ごとの印がないため）。
 */
export function HistoryCalendar({ initialDate, workoutDates, selectedDate, onSelect }: HistoryCalendarProps) {
  const nav = useCalendarNavigation({ initialValue: initialDate as ISODateString });
  const visible = nav.visibleCalendarMonths[0]!;
  const { weeks, dayNames } = useCalendarDays({ year: visible.year, month: visible.month, weekStartsOn: 0 });

  return (
    <div className="history-calendar">
      <div className="history-calendar-nav">
        <Button
          label="前の月"
          isIconOnly
          icon={<ChevronLeft aria-hidden />}
          variant="ghost"
          onClick={() => nav.navigateMonth(-1)}
        />
        <strong aria-live="polite">{nav.monthYearLabel}</strong>
        <Button
          label="次の月"
          isIconOnly
          icon={<ChevronRight aria-hidden />}
          variant="ghost"
          onClick={() => nav.navigateMonth(1)}
        />
      </div>

      <div className="history-calendar-grid" role="grid" aria-label={nav.monthYearLabel}>
        <div role="row" className="history-calendar-row">
          {dayNames.map((name) => (
            <div key={name} role="columnheader" className="history-calendar-dayname">
              {name}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]!.iso} role="row" className="history-calendar-row">
            {week.map((day) => {
              const has = workoutDates.has(day.iso);
              return (
                <div key={day.iso} role="gridcell">
                  <button
                    type="button"
                    className="history-calendar-day"
                    data-outside={day.isOutside || undefined}
                    data-has-workout={has || undefined}
                    aria-pressed={selectedDate === day.iso}
                    aria-label={`${day.iso}${has ? '（ワークアウトあり）' : ''}`}
                    onClick={() => onSelect(day.iso)}
                  >
                    <span>{day.dayNumber}</span>
                    <span className="history-calendar-mark" aria-hidden>{has ? '●' : ''}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
