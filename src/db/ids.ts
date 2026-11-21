import type { ID } from '../domain/types';

export const newId = (): ID => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();
