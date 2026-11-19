import { describe, expect, it } from 'vitest';
import { CSV_BOM, CSV_HEADER, createSetsCsv, escapeCsvField, type CsvSource } from './csv';
import type { Exercise, Workout, WorkoutExercise, WorkoutSet } from './types';

const T = '2026-11-17T10:00:00.000Z';

const exercise = (id: string, name: string, bodyPart: Exercise['bodyPart'] = 'chest', archived = false): Exercise => ({
  id, name, nameKey: name.toLowerCase(), bodyPart, archived, createdAt: T, updatedAt: T,
});
const workout = (id: string, date: string, createdAt = `${date}T10:00:00.000Z`): Workout => ({
  id, date, status: 'completed', memo: '', createdAt, completedAt: createdAt, updatedAt: createdAt,
});
const we = (id: string, workoutId: string, exerciseId: string, order: number): WorkoutExercise => ({
  id, workoutId, exerciseId, order, targetSets: null,
});
const set = (id: string, workoutExerciseId: string, workoutId: string, exerciseId: string, order: number, weightKg: number, reps: number): WorkoutSet => ({
  id, workoutExerciseId, workoutId, exerciseId, order, weightTenthKg: Math.round(weightKg * 10), reps, createdAt: T,
});

type MutableSource = { [K in keyof CsvSource]: CsvSource[K] extends readonly (infer T)[] ? T[] : never };

const lines = (csv: string) => csv.replace(CSV_BOM, '').split('\r\n');

const base = (): MutableSource => ({
  exercises: [exercise('e1', 'ベンチプレス', 'chest'), exercise('e2', 'スクワット', 'legs')],
  workouts: [workout('w1', '2026-11-10')],
  workoutExercises: [we('we1', 'w1', 'e1', 0), we('we2', 'w1', 'e2', 1)],
  sets: [
    set('s1', 'we1', 'w1', 'e1', 1, 60, 10),
    set('s2', 'we1', 'w1', 'e1', 2, 62.5, 8),
    set('s3', 'we2', 'w1', 'e2', 1, 100, 5),
  ],
});

describe('escapeCsvField', () => {
  it('REQ-5.7: 特殊文字を含まない値はそのまま返す', () => {
    expect(escapeCsvField('ベンチプレス')).toBe('ベンチプレス');
  });

  it('REQ-5.7: カンマを含む値は二重引用符で囲む', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('REQ-5.7: 二重引用符を含む値は、囲んだうえで二重引用符を重ねる', () => {
    expect(escapeCsvField('5" ケーブル')).toBe('"5"" ケーブル"');
  });

  it('REQ-5.7: 改行（LF・CRLF・CR）を含む値は二重引用符で囲む', () => {
    expect(escapeCsvField('a\nb')).toBe('"a\nb"');
    expect(escapeCsvField('a\r\nb')).toBe('"a\r\nb"');
    expect(escapeCsvField('a\rb')).toBe('"a\rb"');
  });

  it('REQ-5.7: 空文字はそのまま返す', () => {
    expect(escapeCsvField('')).toBe('');
  });
});

describe('createSetsCsv', () => {
  it('REQ-5.7: 先頭に UTF-8 の BOM を付ける', () => {
    expect(createSetsCsv(base()).startsWith(CSV_BOM)).toBe(true);
    expect(CSV_BOM).toBe('﻿');
  });

  it('REQ-5.7: 1 行目は「日付,種目,部位,セット番号,重量,回数」', () => {
    expect(CSV_HEADER).toBe('日付,種目,部位,セット番号,重量,回数');
    expect(lines(createSetsCsv(base()))[0]).toBe(CSV_HEADER);
  });

  it('REQ-5.7: 1 行 1 セットで、各列の値を出力する', () => {
    expect(lines(createSetsCsv(base())).slice(1, 4)).toEqual([
      '2026-11-10,ベンチプレス,胸,1,60.0,10',
      '2026-11-10,ベンチプレス,胸,2,62.5,8',
      '2026-11-10,スクワット,脚,1,100.0,5',
    ]);
  });

  it('REQ-5.7: 行は CRLF で区切り、末尾も CRLF で終える', () => {
    const csv = createSetsCsv(base());
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.replace(/\r\n/g, '').includes('\n')).toBe(false);
    expect(lines(csv)).toHaveLength(1 + 3 + 1);
  });

  it('REQ-5.7: セットがないときはヘッダー行だけを出力する', () => {
    const csv = createSetsCsv({ ...base(), sets: [] });
    expect(csv).toBe(`${CSV_BOM}${CSV_HEADER}\r\n`);
  });

  it('REQ-5.7: 部位は日本語の名称で出力する', () => {
    const source: CsvSource = {
      exercises: (['chest', 'back', 'legs', 'shoulders', 'arms', 'abs', 'other'] as const).map((p, i) => exercise(`e${i}`, `種目${i}`, p)),
      workouts: [workout('w1', '2026-11-10')],
      workoutExercises: Array.from({ length: 7 }, (_, i) => we(`we${i}`, 'w1', `e${i}`, i)),
      sets: Array.from({ length: 7 }, (_, i) => set(`s${i}`, `we${i}`, 'w1', `e${i}`, 1, 10, 1)),
    };
    const parts = lines(createSetsCsv(source)).slice(1, 8).map((l) => l.split(',')[2]);
    expect(parts).toEqual(['胸', '背中', '脚', '肩', '腕', '腹', 'その他']);
  });

  it('REQ-5.7: 重量は小数第 1 位まで出力する（0kg を含む）', () => {
    const source = base();
    source.sets = [set('a', 'we1', 'w1', 'e1', 1, 0, 12), set('b', 'we1', 'w1', 'e1', 2, 0.1, 1), set('c', 'we1', 'w1', 'e1', 3, 999.9, 1)];
    expect(lines(createSetsCsv(source)).slice(1, 4).map((l) => l.split(',')[4])).toEqual(['0.0', '0.1', '999.9']);
  });

  it('REQ-5.7: 日付の古い順に並べ、同じ日付は作成日時の古い順に並べる', () => {
    const source: CsvSource = {
      exercises: [exercise('e1', 'ベンチプレス')],
      workouts: [
        workout('late', '2026-11-15'),
        workout('evening', '2026-11-10', '2026-11-10T19:00:00.000Z'),
        workout('morning', '2026-11-10', '2026-11-10T07:00:00.000Z'),
      ],
      workoutExercises: [we('a', 'late', 'e1', 0), we('b', 'evening', 'e1', 0), we('c', 'morning', 'e1', 0)],
      sets: [
        set('s1', 'a', 'late', 'e1', 1, 70, 1),
        set('s2', 'b', 'evening', 'e1', 1, 65, 1),
        set('s3', 'c', 'morning', 'e1', 1, 60, 1),
      ],
    };
    const rows = lines(createSetsCsv(source)).slice(1, 4);
    expect(rows.map((r) => r.split(',')[4])).toEqual(['60.0', '65.0', '70.0']);
    expect(rows.map((r) => r.split(',')[0])).toEqual(['2026-11-10', '2026-11-10', '2026-11-15']);
  });

  it('REQ-5.7: 同じワークアウト内は種目の順序、種目内はセットの順序で並べる', () => {
    const source = base();
    source.workoutExercises = [we('we1', 'w1', 'e1', 1), we('we2', 'w1', 'e2', 0)];
    source.sets = [...source.sets].reverse();
    expect(lines(createSetsCsv(source)).slice(1, 4).map((l) => l.split(',').slice(1).join(','))).toEqual([
      'スクワット,脚,1,100.0,5',
      'ベンチプレス,胸,1,60.0,10',
      'ベンチプレス,胸,2,62.5,8',
    ]);
  });

  it('REQ-5.7: セット番号は種目ごとに 1 から数え直す（保存されている順序の値に依存しない）', () => {
    const source = base();
    source.sets = [set('a', 'we1', 'w1', 'e1', 5, 60, 10), set('b', 'we1', 'w1', 'e1', 9, 60, 8)];
    expect(lines(createSetsCsv(source)).slice(1, 3).map((l) => l.split(',')[3])).toEqual(['1', '2']);
  });

  it('REQ-5.7: 同じ種目をワークアウトに 2 回追加した場合も、それぞれの種目記録ごとに番号を数える', () => {
    const source = base();
    source.workoutExercises = [we('we1', 'w1', 'e1', 0), we('we2', 'w1', 'e1', 1)];
    source.sets = [set('a', 'we1', 'w1', 'e1', 1, 60, 10), set('b', 'we2', 'w1', 'e1', 1, 50, 12)];
    expect(lines(createSetsCsv(source)).slice(1, 3).map((l) => l.split(',')[3])).toEqual(['1', '1']);
  });

  it('REQ-5.7: アーカイブ済みの種目のセットも出力する', () => {
    const source = base();
    source.exercises = [exercise('e1', 'ベンチプレス', 'chest', true), exercise('e2', 'スクワット', 'legs')];
    expect(lines(createSetsCsv(source)).slice(1, 4)).toHaveLength(3);
    expect(createSetsCsv(source)).toContain('ベンチプレス');
  });

  it('REQ-5.7: 参照先がないセットは出力しない', () => {
    const source = base();
    source.sets.push(set('x', 'ghost', 'w1', 'e1', 1, 1, 1));
    expect(lines(createSetsCsv(source))).toHaveLength(1 + 3 + 1);
  });

  it('REQ-5.7: 種目名にカンマ・引用符・改行があっても 1 行 1 セットの形式を保つ', () => {
    const source = base();
    source.exercises = [exercise('e1', 'a,"b"\nc'), exercise('e2', 'スクワット', 'legs')];
    const csv = createSetsCsv(source);
    expect(csv).toContain('2026-11-10,"a,""b""\nc",胸,1,60.0,10\r\n');
  });

  describe('表計算ソフトで数式として実行されないようにする', () => {
    it.each(['=SUM(A1:A9)', '+1', '-2', '@cmd', '\tx', '\rx'])('種目名が「%s」で始まるとき、先頭に引用符を付ける', (name) => {
      const source = base();
      source.exercises = [exercise('e1', name), exercise('e2', 'スクワット', 'legs')];
      const body = createSetsCsv(source).replace(CSV_BOM, '');
      const field = body.split('\r\n')[1]!.split(',')[1]!.replace(/^"/, '');
      expect(field.startsWith("'")).toBe(true);
    });

    it('引用符の付加と二重引用符の囲みを両立する', () => {
      const source = base();
      source.exercises = [exercise('e1', '=a,b'), exercise('e2', 'スクワット', 'legs')];
      expect(createSetsCsv(source)).toContain(`2026-11-10,"'=a,b",胸,1,60.0,10`);
    });

    it('通常の種目名は変更しない', () => {
      const source = base();
      source.exercises = [exercise('e1', 'A-B プレス'), exercise('e2', 'スクワット', 'legs')];
      expect(createSetsCsv(source)).toContain('2026-11-10,A-B プレス,胸,1,60.0,10');
    });
  });
});
