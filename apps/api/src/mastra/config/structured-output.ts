import type { z } from 'zod';
import type { ZodType as MastraZodType, ZodTypeDef } from 'zod/v3';

/**
 * Pass a schema from @openathlete/shared to Mastra `structuredOutput`.
 *
 * Both sides use the same zod@3 runtime, but TypeScript resolves zod's CJS
 * typings for this package and its ESM typings through `zod/v3` for Mastra,
 * so the two ZodType declarations are not assignable to each other.
 *
 * Mastra returns the parsed value, so input and output are both typed as the
 * schema output (defaults applied).
 */
export function toMastraSchema<S extends z.ZodTypeAny>(
  schema: S,
): MastraZodType<z.output<S>, ZodTypeDef, z.output<S>> {
  return schema as unknown as MastraZodType<
    z.output<S>,
    ZodTypeDef,
    z.output<S>
  >;
}
