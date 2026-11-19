export type ID = string;
/** 'YYYY-MM-DD'（端末のローカル日付） */
export type ISODate = string;
/** new Date().toISOString() */
export type ISODateTime = string;

export const BODY_PARTS = ['chest', 'back', 'legs', 'shoulders', 'arms', 'abs', 'other'] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  abs: '腹',
  other: 'その他',
};

export interface Exercise {
  id: ID;
  name: string;
  /** 重複判定用: trim + NFKC 正規化 + 小文字化（REQ-2.4） */
  nameKey: string;
  bodyPart: BodyPart;
  archived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type WorkoutStatus = 'in_progress' | 'completed';

export interface Workout {
  id: ID;
  date: ISODate;
  status: WorkoutStatus;
  memo: string;
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export interface WorkoutExercise {
  id: ID;
  workoutId: ID;
  exerciseId: ID;
  order: number;
  targetSets: number | null;
}

export interface WorkoutSet {
  id: ID;
  workoutExerciseId: ID;
  workoutId: ID;
  exerciseId: ID;
  order: number;
  /** 重量 × 10 の整数（例: 62.5kg → 625） */
  weightTenthKg: number;
  reps: number;
  createdAt: ISODateTime;
}

export interface TemplateItem {
  exerciseId: ID;
  targetSets: number | null;
}

export interface Template {
  id: ID;
  name: string;
  items: TemplateItem[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
