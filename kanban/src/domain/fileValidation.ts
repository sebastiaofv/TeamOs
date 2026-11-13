import { z } from 'zod';
import { isRecord, normalizeTimestamp } from './util';

export const filledTextSchema = z.string().min(1);
export const positiveIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const timestampSchema = z.string().refine(value => Boolean(normalizeTimestamp(value)));
export const uniqueIdListSchema = z.array(filledTextSchema).refine(value => new Set(value).size === value.length);
// This checks a payload without cloning it or discarding unknown extension fields.
export const recordSchema = z.custom<Record<string, unknown>>(isRecord);
