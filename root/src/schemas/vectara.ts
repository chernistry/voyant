import { z } from 'zod';

/**
 * Vectara citation with optional metadata for policy documents.
 */
export const VectaraCitation = z.object({
  text: z.string().optional(),
  score: z.number().optional(),
  documentId: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  page: z.number().optional(),
});

/**
 * Individual search hit from Vectara query response.
 */
export const VectaraQueryHit = z.object({
  snippet: z.string().optional(),
  score: z.number().optional(),
  documentId: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  page: z.number().optional(),
});

/**
 * Complete Vectara query response with summary and citations.
 */
export const VectaraQueryResponse = z.object({
  summary: z.string().optional(),
  hits: z.array(VectaraQueryHit).default([]),
  citations: z.array(VectaraCitation).default([]),
});

export type VectaraQueryResponseT = z.infer<typeof VectaraQueryResponse>;

/**
 * Policy document for indexing into Vectara corpora.
 */
export const PolicyDocument = z.object({
  id: z.string(),
  corpus: z.enum(['airlines', 'hotels', 'visas']),
  title: z.string(),
  text: z.string(),
  url: z.string().optional(),
  airline_code: z.string().optional(),
  hotel_chain: z.string().optional(),
  country: z.string().optional(),
  last_updated: z.string().optional(),
});

export type PolicyDocumentT = z.infer<typeof PolicyDocument>;
