import { z } from "zod";

export const StructuredRagAnswerSchema = z.object({
  answer: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  citations: z.array(
    z.object({
      sourceNumber: z.number().int().positive(),
    }),
  ),
  missingContext: z.boolean(),
});

export type StructuredRagAnswer = z.infer<typeof StructuredRagAnswerSchema>;

const extractJsonObject = (raw: string): string => {
  const fencedJson = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedJson?.[1]) return fencedJson[1].trim();

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1).trim();
  }

  return raw.trim();
};

export const parseStructuredRagAnswer = (raw: string): StructuredRagAnswer => {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    return StructuredRagAnswerSchema.parse(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid structured RAG answer: ${reason}`);
  }
};
