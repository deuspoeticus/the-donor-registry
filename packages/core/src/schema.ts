/**
 * Payload validation (§8). Everything crossing the wire goes through here.
 *
 * The bounds are deliberate rather than defensive boilerplate: an attribute
 * vector is a fixed set of known keys with known shapes, so anything else is
 * either a bug or an attempt to use the pool as storage.
 */

import { z } from 'zod';
import { ATTR_IDS } from './attributes.js';
import { fingerprintId } from './canonical.js';

/** Extension and voice lists are genuinely long; nothing legitimate exceeds this. */
const MAX_VALUE_CHARS = 8192;

export const attrValueSchema = z.union([
  z.string().max(MAX_VALUE_CHARS),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const knownIds = new Set(ATTR_IDS);

export const attrVectorSchema = z
  .record(z.string().max(64), attrValueSchema)
  .refine((v) => Object.keys(v).every((k) => knownIds.has(k)), {
    message: 'unknown attribute id',
  })
  .refine((v) => Object.keys(v).length <= ATTR_IDS.length, {
    message: 'too many attributes',
  });

export const idSchema = z.string().regex(/^[0-9a-f]{64}$/, 'id must be a sha256 hex digest');

export const donateSchema = z
  .object({
    attrs: attrVectorSchema,
    id: idSchema,
    /**
     * An attribute, never a gate. Nothing downstream branches on it: it is
     * stored, counted in the aggregate, and never returned per entry.
     */
    automation: z.number().min(0).max(1).nullable().default(null),
    /** Present so the record shows consent was given explicitly, not inferred. */
    consent: z.literal('donate'),
  })
  .refine((body) => fingerprintId(body.attrs) === body.id, {
    message: 'id does not match the canonical hash of attrs',
    path: ['id'],
  });

export type DonateBody = z.infer<typeof donateSchema>;

export const poolQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  /** Deterministic orderings only. No search, because search over this pool is a lookup service. */
  sort: z.enum(['recent', 'worn', 'id']).default('recent'),
});

export const wearSchema = z.object({
  /**
   * A wear is only counted once per browser per identity, which the client
   * asserts by sending the token it stored the first time. The server keeps no
   * device identifier of its own to check this against, and says so.
   */
  first: z.boolean().default(true),
});

export const reportSchema = z.object({
  /** Count of distinct origins that saw the borrowed identity. Never the origins. */
  originCount: z.number().int().min(0).max(10000),
});

export const revokeSchema = z.object({
  token: z.string().min(16).max(256),
});

export const consequenceSchema = z.object({
  identityId: idSchema.optional(),
  category: z.enum([
    'captcha',
    'price-changed',
    'checkout-refused',
    'account-locked',
    'content-blocked',
    'layout-broken',
    'nothing-happened',
    'other',
  ]),
  /** Free text. No URLs and no account details, enforced below rather than requested politely. */
  note: z
    .string()
    .max(600)
    .refine((s) => !/https?:\/\/|www\.|@[\w.-]+\.\w/i.test(s), {
      message: 'remove URLs, domains and addresses',
    }),
});
