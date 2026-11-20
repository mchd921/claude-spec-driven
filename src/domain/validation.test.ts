import { describe, expect, it } from 'vitest';
import {
  createNameKey,
  kgToTenthKg,
  MEMO_MAX_LENGTH,
  tenthKgToKg,
  validateBodyPart,
  validateExerciseName,
  validateSet,
  validateTemplate,
  validateWorkoutDate,
} from './validation';

describe('重量の単位変換', () => {
  it('kg を 0.1kg 単位の整数に変換する（浮動小数の誤差を出さない）', () => {
    expect(kgToTenthKg(62.5)).toBe(625);
    expect(kgToTenthKg(0.1)).toBe(1);
    expect(kgToTenthKg(0.3)).toBe(3);
    expect(kgToTenthKg(1.15 * 2)).toBe(23);
    expect(kgToTenthKg(0)).toBe(0);
  });

  it('0.1kg 単位の整数を kg に戻す', () => {
    expect(tenthKgToKg(625)).toBe(62.5);
    expect(tenthKgToKg(0)).toBe(0);
    expect(tenthKgToKg(9999)).toBe(999.9);
  });
});

describe('validateSet', () => {
  it('REQ-1.9: 有効な重量と回数を 0.1kg 単位の整数に変換して返す', () => {
    expect(validateSet(62.5, 8)).toEqual({ ok: true, value: { weightTenthKg: 625, reps: 8 } });
  });

  it.each([
    ['下限', 0, 1],
    ['上限', 999.9, 999],
    ['整数の重量', 60, 10],
  ])('REQ-1.9: 境界値（%s）を受け付ける', (_name, weight, reps) => {
    expect(validateSet(weight, reps).ok).toBe(true);
  });

  it('REQ-1.9: 自重種目として重量 0kg を受け付ける', () => {
    expect(validateSet(0, 10)).toEqual({ ok: true, value: { weightTenthKg: 0, reps: 10 } });
  });

  it.each([
    ['負の数', -0.1],
    ['上限超過', 1000],
    ['上限をわずかに超過', 999.95],
    ['小数第 2 位', 60.25],
    ['NaN', Number.NaN],
    ['無限大', Number.POSITIVE_INFINITY],
    ['未入力 (null)', null],
    ['未入力 (undefined)', undefined],
  ])('REQ-1.9: 重量が不正（%s）のとき、weight のエラーを返す', (_name, weight) => {
    const result = validateSet(weight, 8);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors)).toEqual(['weight']);
      expect(result.errors.weight).toBeTruthy();
    }
  });

  it.each([
    ['0', 0],
    ['負の数', -1],
    ['上限超過', 1000],
    ['小数', 8.5],
    ['NaN', Number.NaN],
    ['未入力 (null)', null],
    ['未入力 (undefined)', undefined],
  ])('REQ-1.9: 回数が不正（%s）のとき、reps のエラーを返す', (_name, reps) => {
    const result = validateSet(60, reps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors)).toEqual(['reps']);
      expect(result.errors.reps).toBeTruthy();
    }
  });

  it('REQ-1.11: 重量と回数がともに不正なとき、両方のエラーを返す', () => {
    const result = validateSet(-1, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['reps', 'weight']);
  });
});

describe('createNameKey', () => {
  it('REQ-2.4: 前後の空白を除き、大文字・小文字を区別しない', () => {
    expect(createNameKey('  Bench Press ')).toBe(createNameKey('bench press'));
  });

  it('REQ-2.4: 全角・半角の違いを区別しない', () => {
    expect(createNameKey('ＢＥＮＣＨ　ＰＲＥＳＳ')).toBe(createNameKey('bench press'));
    expect(createNameKey('ﾍﾞﾝﾁﾌﾟﾚｽ')).toBe(createNameKey('ベンチプレス'));
  });

  it('REQ-2.4: 異なる名前は異なるキーになる', () => {
    expect(createNameKey('ベンチプレス')).not.toBe(createNameKey('ダンベルプレス'));
  });
});

describe('validateExerciseName', () => {
  const existing = [
    { id: 'a', nameKey: createNameKey('ベンチプレス') },
    { id: 'b', nameKey: createNameKey('スクワット') },
  ];

  it('REQ-2.2: 前後の空白を除いた名前と nameKey を返す', () => {
    expect(validateExerciseName('  懸垂 ', existing)).toEqual({
      ok: true,
      value: { name: '懸垂', nameKey: createNameKey('懸垂') },
    });
  });

  it('REQ-2.3: 1 文字と 50 文字を受け付ける', () => {
    expect(validateExerciseName('あ', existing).ok).toBe(true);
    expect(validateExerciseName('あ'.repeat(50), existing).ok).toBe(true);
  });

  it('REQ-2.3: 空文字・空白のみ・51 文字を拒否する', () => {
    for (const name of ['', '   ', '　', 'あ'.repeat(51)]) {
      const result = validateExerciseName(name, existing);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeTruthy();
    }
  });

  it('REQ-2.3: 前後の空白は文字数に含めない（空白付きの 50 文字は有効）', () => {
    expect(validateExerciseName(` ${'あ'.repeat(50)} `, existing).ok).toBe(true);
  });

  it('REQ-2.3: サロゲートペアの文字も 1 文字として数える', () => {
    expect(validateExerciseName('𠮷'.repeat(50), existing).ok).toBe(true);
    expect(validateExerciseName('𠮷'.repeat(51), existing).ok).toBe(false);
  });

  it('REQ-2.4: 既存の種目と重複するとき拒否する（全角・大文字小文字・空白の違いを無視）', () => {
    const withLatin = [...existing, { id: 'c', nameKey: createNameKey('Deadlift') }];
    for (const name of ['ベンチプレス', ' ベンチプレス ', 'ﾍﾞﾝﾁﾌﾟﾚｽ', 'ＤＥＡＤＬＩＦＴ', 'deadlift']) {
      const result = validateExerciseName(name, withLatin);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toContain('重複');
    }
  });

  it('REQ-2.6: 編集時は自分自身との重複を無視する', () => {
    expect(validateExerciseName('ベンチプレス', existing, 'a').ok).toBe(true);
  });

  it('REQ-2.6: 編集時でも他の種目との重複は拒否する', () => {
    expect(validateExerciseName('スクワット', existing, 'a').ok).toBe(false);
  });

  it('REQ-2.6: 編集時でも文字数の範囲外は拒否する', () => {
    expect(validateExerciseName('', existing, 'a').ok).toBe(false);
  });
});

describe('validateBodyPart', () => {
  it('REQ-2.2: 定義済みの部位を受け付ける', () => {
    for (const part of ['chest', 'back', 'legs', 'shoulders', 'arms', 'abs', 'other']) {
      expect(validateBodyPart(part)).toEqual({ ok: true, value: part });
    }
  });

  it('REQ-2.2: 未定義の値・未選択を拒否し、bodyPart のエラーを返す', () => {
    for (const value of ['neck', '', null, undefined, 1]) {
      const result = validateBodyPart(value);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.bodyPart).toBeTruthy();
    }
  });
});

describe('validateTemplate', () => {
  const item = (exerciseId: string, targetSets: number | null = null) => ({ exerciseId, targetSets });

  it('REQ-4.1: 前後の空白を除いた名前と、指定した順序の種目を返す', () => {
    const items = [item('x', 3), item('y'), item('z', 5)];
    expect(validateTemplate(' 胸の日 ', items)).toEqual({
      ok: true,
      value: { name: '胸の日', items },
    });
  });

  it('REQ-4.2: 名前が 1 文字と 50 文字のとき受け付ける', () => {
    expect(validateTemplate('あ', [item('x')]).ok).toBe(true);
    expect(validateTemplate('あ'.repeat(50), [item('x')]).ok).toBe(true);
  });

  it('REQ-4.2: 名前が空・空白のみ・51 文字のとき name のエラーを返す', () => {
    for (const name of ['', '  ', 'あ'.repeat(51)]) {
      const result = validateTemplate(name, [item('x')]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.name).toBeTruthy();
    }
  });

  it('REQ-4.3: 種目が 0 件のとき items のエラーを返す', () => {
    const result = validateTemplate('胸の日', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.items).toBeTruthy();
  });

  it('REQ-4.4: 目標セット数が null と 1〜20 の整数のとき受け付ける', () => {
    for (const targetSets of [null, 1, 20]) {
      expect(validateTemplate('胸の日', [item('x', targetSets)]).ok).toBe(true);
    }
  });

  it.each([0, 21, 2.5, -1, Number.NaN])('REQ-4.4: 目標セット数が %s のとき、その種目のエラーを返す', (targetSets) => {
    const result = validateTemplate('胸の日', [item('x'), item('y', targetSets)]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors['items.1.targetSets']).toBeTruthy();
  });

  it('REQ-4.2, 4.3: 名前と種目がともに不正なとき、両方のエラーを返す', () => {
    const result = validateTemplate('', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['items', 'name']);
  });
});

describe('validateWorkoutDate', () => {
  it('REQ-1.16: 当日を受け付ける', () => {
    expect(validateWorkoutDate('2026-11-17', '2026-11-17')).toEqual({ ok: true, value: '2026-11-17' });
  });

  it('REQ-1.16: 過去の日付を受け付ける（月・年をまたぐ場合を含む）', () => {
    expect(validateWorkoutDate('2026-11-16', '2026-11-17').ok).toBe(true);
    expect(validateWorkoutDate('2025-12-31', '2026-01-01').ok).toBe(true);
    expect(validateWorkoutDate('2020-02-29', '2026-11-17').ok).toBe(true);
  });

  it('REQ-1.17: 翌日以降を拒否する', () => {
    for (const date of ['2026-11-18', '2026-12-01', '2027-01-01']) {
      const result = validateWorkoutDate(date, '2026-11-17');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.date).toBeTruthy();
    }
  });

  it('REQ-1.17: 日付として不正な文字列を拒否する', () => {
    for (const date of ['', '2026-1-1', '2026/11/17', '2026-13-01', '2026-02-30', '2025-02-29', 'abc']) {
      expect(validateWorkoutDate(date, '2026-11-17').ok).toBe(false);
    }
  });
});

describe('MEMO_MAX_LENGTH', () => {
  it('REQ-1.15: メモの上限は 500 文字', () => {
    expect(MEMO_MAX_LENGTH).toBe(500);
  });
});
