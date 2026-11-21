import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useState } from 'react';
import { parseNumberInput, weightInputText } from '../format';
import type { SetDefaults } from '../../domain/setDefaults';
import './SetInputRow.css';

export interface SetFormValues {
  weightKg: number | null;
  reps: number | null;
}

interface SetInputRowProps {
  /** 入力欄の初期値。なければ空欄。 */
  defaults: SetDefaults | null;
  submitLabel: string;
  /** 確定する。エラーがあれば、入力欄ごとのエラー（weight / reps）を返す。成功なら null。 */
  onSubmit: (values: SetFormValues) => Promise<Record<string, string> | null>;
}

/** 数値の文字列を step だけ増減する。数値でなければ 0 から始める。下限は min。 */
function stepText(text: string, delta: number, min: number): string {
  const current = parseNumberInput(text);
  const base = current !== null && Number.isFinite(current) ? current : 0;
  const next = Math.max(min, Math.round((base + delta) * 10) / 10);
  return String(next);
}

/** 重量（±1kg）と回数（±1）の入力欄と、確定ボタン。初期値があれば 1 タップで確定できる（NFR-4）。 */
export function SetInputRow({ defaults, submitLabel, onSubmit }: SetInputRowProps) {
  const [weight, setWeight] = useState(defaults ? weightInputText(defaults.weightTenthKg) : '');
  const [reps, setReps] = useState(defaults ? String(defaults.reps) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const result = await onSubmit({ weightKg: parseNumberInput(weight), reps: parseNumberInput(reps) });
    setErrors(result ?? {});
  };
  const status = (key: string) => (errors[key] ? { type: 'error' as const, message: errors[key] } : undefined);

  return (
    <div className="set-input-row">
      <div className="set-input-field">
        <Button label="−" aria-label="重量を 1kg 減らす" variant="secondary" onClick={() => setWeight(stepText(weight, -1, 0))} />
        <TextInput
          label="重量 (kg)"
          value={weight}
          onChange={setWeight}
          inputMode="decimal"
          status={status('weight')}
          onEnter={() => void submit()}
        />
        <Button label="+" aria-label="重量を 1kg 増やす" variant="secondary" onClick={() => setWeight(stepText(weight, 1, 0))} />
      </div>
      <div className="set-input-field">
        <Button label="−" aria-label="回数を 1 減らす" variant="secondary" onClick={() => setReps(stepText(reps, -1, 1))} />
        <TextInput
          label="回数"
          value={reps}
          onChange={setReps}
          inputMode="numeric"
          status={status('reps')}
          onEnter={() => void submit()}
        />
        <Button label="+" aria-label="回数を 1 増やす" variant="secondary" onClick={() => setReps(stepText(reps, 1, 1))} />
      </div>
      <Button label={submitLabel} variant="primary" onClick={() => void submit()} />
    </div>
  );
}
