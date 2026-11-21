import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Heading } from '@astryxdesign/core/Heading';
import type { ExercisePoint } from '../../domain/metrics';
import './ProgressChart.css';

interface ProgressChartProps {
  title: string;
  unit: string;
  points: readonly ExercisePoint[];
  value: (point: ExercisePoint) => number;
}

/** 線・軸・文字の色は Astryx のテーマ変数を参照し、ライト / ダークの両方で読めるようにする（NFR-10）。 */
const LINE_COLOR = 'var(--color-accent, #2563eb)';
const TEXT_COLOR = 'var(--color-text-secondary, #555)';
const GRID_COLOR = 'var(--color-border, rgb(128 128 128 / 0.25))';

export function ProgressChart({ title, unit, points, value }: ProgressChartProps) {
  const data = points.map((point) => ({ date: point.date, value: value(point) }));
  return (
    <section className="progress-chart" aria-label={title}>
      <Heading level={2}>
        {title}（{unit}）
      </Heading>
      <div
        className="progress-chart-plot"
        role="img"
        aria-label={`${title}の推移（${unit}）、${points.length} 件`}
      >
        <ResponsiveContainer width="100%" height={220} minWidth={0}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fill: TEXT_COLOR, fontSize: 12 }} stroke={GRID_COLOR} minTickGap={24} />
            <YAxis tick={{ fill: TEXT_COLOR, fontSize: 12 }} stroke={GRID_COLOR} width={48} />
            <Tooltip
              contentStyle={{
                background: 'var(--color-background-surface, #fff)',
                border: `1px solid ${GRID_COLOR}`,
                color: 'var(--color-text-primary, #111)',
              }}
              formatter={(v) => [`${String(v)} ${unit}`, title]}
            />
            <Line type="monotone" dataKey="value" stroke={LINE_COLOR} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
