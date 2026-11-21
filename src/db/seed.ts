import type { BodyPart, Exercise, ISODateTime } from '../domain/types';
import { createNameKey } from '../domain/validation';

/** 初期種目（設計書 3.4 節）。「その他」はユーザーが追加するため含めない。 */
export const INITIAL_EXERCISES: ReadonlyArray<{ bodyPart: BodyPart; names: readonly string[] }> = [
  { bodyPart: 'chest', names: ['ベンチプレス', 'ダンベルプレス', 'インクラインベンチプレス', 'ダンベルフライ'] },
  { bodyPart: 'back', names: ['デッドリフト', '懸垂', 'ラットプルダウン', 'ベントオーバーロウ'] },
  { bodyPart: 'legs', names: ['スクワット', 'レッグプレス', 'ルーマニアンデッドリフト', 'レッグカール'] },
  { bodyPart: 'shoulders', names: ['ショルダープレス', 'サイドレイズ', 'リアレイズ'] },
  { bodyPart: 'arms', names: ['バーベルカール', 'ダンベルカール', 'トライセプスエクステンション'] },
  { bodyPart: 'abs', names: ['クランチ', 'プランク', 'レッグレイズ'] },
];

export function createInitialExercises(newId: () => string, now: ISODateTime): Exercise[] {
  return INITIAL_EXERCISES.flatMap(({ bodyPart, names }) =>
    names.map((name) => ({
      id: newId(),
      name,
      nameKey: createNameKey(name),
      bodyPart,
      archived: false,
      createdAt: now,
      updatedAt: now,
    })),
  );
}
