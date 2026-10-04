import { z } from 'zod';

export const createAccessTokenSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    /** null: never expires */
    expiresInDays: z
      .union([z.literal(30), z.literal(90), z.literal(365)])
      .nullable(),
  })
  .strict();
export type CreateAccessToken = z.infer<typeof createAccessTokenSchema>;

export interface AccessTokenDto {
  personalAccessTokenId: number;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
}

/** Returned once, at creation. */
export interface CreatedAccessTokenDto extends Omit<
  AccessTokenDto,
  'lastUsedAt'
> {
  token: string;
}
