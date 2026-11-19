import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackupFile,
  parseBackupText,
  validateBackup,
  type BackupData,
} from './backupSchema';
import { createNameKey } from './validation';

const T = '2026-11-17T10:00:00.000Z';

function validData(): BackupData {
  return {
    exercises: [
      { id: 'e1', name: 'ベンチプレス', nameKey: createNameKey('ベンチプレス'), bodyPart: 'chest', archived: false, createdAt: T, updatedAt: T },
      { id: 'e2', name: 'スクワット', nameKey: createNameKey('スクワット'), bodyPart: 'legs', archived: true, createdAt: T, updatedAt: T },
    ],
    workouts: [
      { id: 'w1', date: '2026-11-10', status: 'completed', memo: '調子よし', createdAt: T, completedAt: T, updatedAt: T },
      { id: 'w2', date: '2026-11-17', status: 'in_progress', memo: '', createdAt: T, completedAt: null, updatedAt: T },
    ],
    workoutExercises: [
      { id: 'we1', workoutId: 'w1', exerciseId: 'e1', order: 0, targetSets: 3 },
      { id: 'we2', workoutId: 'w2', exerciseId: 'e1', order: 0, targetSets: null },
    ],
    sets: [
      { id: 's1', workoutExerciseId: 'we1', workoutId: 'w1', exerciseId: 'e1', order: 1, weightTenthKg: 600, reps: 10, createdAt: T },
      { id: 's2', workoutExerciseId: 'we1', workoutId: 'w1', exerciseId: 'e1', order: 2, weightTenthKg: 625, reps: 8, createdAt: T },
    ],
    templates: [
      { id: 't1', name: '胸の日', items: [{ exerciseId: 'e1', targetSets: 3 }, { exerciseId: 'e2', targetSets: null }], createdAt: T, updatedAt: T },
    ],
  };
}

const file = (data: BackupData = validData()) => createBackupFile(data, T);

/** 有効なバックアップを複製し、mutate で壊して検証する。 */
function broken(mutate: (f: ReturnType<typeof file>) => void) {
  const f = structuredClone(file());
  mutate(f);
  return validateBackup(f);
}

function expectRejected(result: ReturnType<typeof validateBackup>) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('unreachable');
  expect(result.error).toBeTruthy();
  return result;
}

describe('createBackupFile', () => {
  it('REQ-5.2: 形式名・バージョン番号・出力日時・全データを含む', () => {
    const f = file();
    expect(f.format).toBe(BACKUP_FORMAT);
    expect(f.version).toBe(BACKUP_VERSION);
    expect(f.exportedAt).toBe(T);
    expect(f.data).toEqual(validData());
  });
});

describe('正しいバックアップ', () => {
  it('REQ-5.2: 出力したデータを JSON にして読み込むと、元のデータと一致する', () => {
    const result = parseBackupText(JSON.stringify(file()));
    expect(result).toEqual({ ok: true, value: file() });
  });

  it('REQ-5.2: すべてのテーブルが空でも受け付ける', () => {
    const empty: BackupData = { exercises: [], workouts: [], workoutExercises: [], sets: [], templates: [] };
    expect(validateBackup(file(empty)).ok).toBe(true);
  });

  it('REQ-5.2: 進行中のワークアウトが 1 件までなら受け付ける', () => {
    expect(validateBackup(file()).ok).toBe(true);
  });
});

describe('ファイル全体の形式（REQ-5.5）', () => {
  it('JSON として読み込めないとき、JSON のエラーを返す', () => {
    for (const text of ['', 'これは JSON ではない', '{"format":', '<html></html>']) {
      const r = expectRejected(parseBackupText(text));
      expect(r.error).toContain('JSON');
    }
  });

  it.each([['配列', '[]'], ['null', 'null'], ['数値', '42'], ['文字列', '"text"']])(
    'JSON でもオブジェクトでない（%s）とき拒否する',
    (_n, text) => {
      expectRejected(parseBackupText(text));
    },
  );

  it('format がこのアプリのものでないとき拒否する', () => {
    expectRejected(broken((f) => { f.format = 'other-app' as never; }));
    expectRejected(validateBackup({ version: 1, data: {} }));
  });

  it('未対応のバージョンのとき、バージョンについてのエラーを返す', () => {
    const r = expectRejected(broken((f) => { f.version = 2 as never; }));
    expect(r.error).toContain('バージョン');
  });

  it('バージョンがないとき拒否する', () => {
    expectRejected(broken((f) => { delete (f as Partial<typeof f>).version; }));
  });

  it('データのテーブルが欠けているとき拒否する', () => {
    expectRejected(broken((f) => { delete (f.data as Partial<BackupData>).sets; }));
    expectRejected(broken((f) => { (f as Partial<typeof f>).data = undefined; }));
  });

  it('未知のキーがあるとき拒否する', () => {
    expectRejected(broken((f) => { (f.data.sets[0] as unknown as Record<string, unknown>).extra = 1; }));
    expectRejected(broken((f) => { (f as unknown as Record<string, unknown>).extra = 1; }));
  });
});

describe('値の検証（REQ-5.5）', () => {
  it.each([
    ['重量が上限超過', (f: ReturnType<typeof file>) => { f.data.sets[0]!.weightTenthKg = 10000; }],
    ['重量が負', (f: ReturnType<typeof file>) => { f.data.sets[0]!.weightTenthKg = -1; }],
    ['重量が小数', (f: ReturnType<typeof file>) => { f.data.sets[0]!.weightTenthKg = 600.5; }],
    ['回数が 0', (f: ReturnType<typeof file>) => { f.data.sets[0]!.reps = 0; }],
    ['回数が上限超過', (f: ReturnType<typeof file>) => { f.data.sets[0]!.reps = 1000; }],
    ['回数が文字列', (f: ReturnType<typeof file>) => { (f.data.sets[0] as { reps: unknown }).reps = '10'; }],
    ['日付が不正', (f: ReturnType<typeof file>) => { f.data.workouts[0]!.date = '2026-02-30'; }],
    ['日付の形式が違う', (f: ReturnType<typeof file>) => { f.data.workouts[0]!.date = '2026/11/10'; }],
    ['日時が不正', (f: ReturnType<typeof file>) => { f.data.workouts[0]!.createdAt = 'いつか'; }],
    ['状態が不明', (f: ReturnType<typeof file>) => { (f.data.workouts[0] as { status: string }).status = 'done'; }],
    ['メモが 501 文字', (f: ReturnType<typeof file>) => { f.data.workouts[0]!.memo = 'あ'.repeat(501); }],
    ['部位が不明', (f: ReturnType<typeof file>) => { (f.data.exercises[0] as { bodyPart: string }).bodyPart = 'neck'; }],
    ['種目名が空', (f: ReturnType<typeof file>) => { f.data.exercises[0]!.name = ''; f.data.exercises[0]!.nameKey = ''; }],
    ['種目名が 51 文字', (f: ReturnType<typeof file>) => { const n = 'あ'.repeat(51); f.data.exercises[0]!.name = n; f.data.exercises[0]!.nameKey = createNameKey(n); }],
    ['ID が空', (f: ReturnType<typeof file>) => { f.data.exercises[0]!.id = ''; }],
    ['メニューの種目が 0 件', (f: ReturnType<typeof file>) => { f.data.templates[0]!.items = []; }],
    ['メニュー名が空', (f: ReturnType<typeof file>) => { f.data.templates[0]!.name = ''; }],
    ['目標セット数が 21', (f: ReturnType<typeof file>) => { f.data.templates[0]!.items[0]!.targetSets = 21; }],
    ['目標セット数が 0', (f: ReturnType<typeof file>) => { f.data.workoutExercises[0]!.targetSets = 0; }],
    ['順序が小数', (f: ReturnType<typeof file>) => { f.data.workoutExercises[0]!.order = 0.5; }],
  ])('%s のとき拒否し、詳細を返す', (_name, mutate) => {
    const r = expectRejected(broken(mutate));
    expect(r.issues.length).toBeGreaterThan(0);
    expect(r.issues.every((i) => typeof i === 'string' && i.length > 0)).toBe(true);
  });

  it('詳細は最大 10 件までにする', () => {
    const r = expectRejected(
      broken((f) => {
        f.data.sets = Array.from({ length: 50 }, (_, i) => ({ ...f.data.sets[0]!, id: `x${i}`, reps: 0 }));
      }),
    );
    expect(r.issues.length).toBeLessThanOrEqual(10);
  });

  it('詳細にどのデータのどの項目かが分かる位置を含む', () => {
    const r = expectRejected(broken((f) => { f.data.sets[1]!.reps = 0; }));
    expect(r.issues.some((i) => i.includes('sets') && i.includes('reps'))).toBe(true);
  });
});

describe('データどうしの整合性（REQ-5.5）', () => {
  it('存在しないワークアウトを参照する WorkoutExercise を拒否する', () => {
    expectRejected(broken((f) => { f.data.workoutExercises[0]!.workoutId = 'ghost'; }));
  });

  it('存在しない種目を参照する WorkoutExercise を拒否する', () => {
    expectRejected(broken((f) => { f.data.workoutExercises[0]!.exerciseId = 'ghost'; }));
  });

  it('存在しない WorkoutExercise を参照するセットを拒否する', () => {
    expectRejected(broken((f) => { f.data.sets[0]!.workoutExerciseId = 'ghost'; }));
  });

  it('セットの workoutId が WorkoutExercise のものと食い違うとき拒否する', () => {
    expectRejected(broken((f) => { f.data.sets[0]!.workoutId = 'w2'; }));
  });

  it('セットの exerciseId が WorkoutExercise のものと食い違うとき拒否する', () => {
    expectRejected(broken((f) => { f.data.sets[0]!.exerciseId = 'e2'; }));
  });

  it('存在しない種目を参照するメニューを拒否する', () => {
    expectRejected(broken((f) => { f.data.templates[0]!.items[0]!.exerciseId = 'ghost'; }));
  });

  it('種目名が重複する（全角・半角・大文字小文字の違いを含む）とき拒否する', () => {
    const r = expectRejected(
      broken((f) => {
        const dup = { ...f.data.exercises[1]!, name: 'ＢＥＮＣＨ', nameKey: createNameKey('bench') };
        f.data.exercises[0]!.name = 'bench';
        f.data.exercises[0]!.nameKey = createNameKey('bench');
        f.data.exercises[1] = dup;
      }),
    );
    expect(r.issues.some((i) => i.includes('重複'))).toBe(true);
  });

  it('nameKey が種目名から作られた値と一致しないとき拒否する', () => {
    expectRejected(broken((f) => { f.data.exercises[0]!.nameKey = 'でたらめ'; }));
  });

  it('同じテーブル内で ID が重複するとき拒否する', () => {
    expectRejected(broken((f) => { f.data.exercises[1]!.id = 'e1'; }));
    expectRejected(broken((f) => { f.data.workouts[1]!.id = 'w1'; }));
    expectRejected(broken((f) => { f.data.sets[1]!.id = 's1'; }));
    expectRejected(broken((f) => { f.data.workoutExercises[1]!.id = 'we1'; }));
    expectRejected(broken((f) => { f.data.templates.push({ ...f.data.templates[0]! }); }));
  });

  it('進行中のワークアウトが 2 件以上あるとき拒否する', () => {
    const r = expectRejected(
      broken((f) => {
        f.data.workouts[0]!.status = 'in_progress';
        f.data.workouts[0]!.completedAt = null;
      }),
    );
    expect(r.issues.some((i) => i.includes('進行中'))).toBe(true);
  });

  it('整合性のエラーのとき、データの不整合である旨を返す', () => {
    const r = expectRejected(broken((f) => { f.data.sets[0]!.workoutExerciseId = 'ghost'; }));
    expect(r.error).toContain('不整合');
  });
});
