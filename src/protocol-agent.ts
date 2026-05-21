import { z } from "zod";
import type { EmbeddingClient, LlmClient, LlmPrompt, SearchResult, VectorSearchStore } from "./types";

const ProtocolAgentPlanSchema = z.object({
  intent: z.string().min(1),
  searchQueries: z.array(z.string().min(1)).min(1).max(5),
  requiredContext: z.array(z.string().min(1)).default([]),
  needsClarification: z.boolean().default(false),
  clarifyingQuestion: z.string().optional(),
});

const ProtocolAgentAnswerSchema = z.object({
  answer: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  citations: z.array(z.object({ sourceNumber: z.number().int().positive() })),
  missingContext: z.boolean(),
  missingDocs: z.array(z.string().min(1)).default([]),
  nextActions: z.array(z.string().min(1)).default([]),
});

export type ProtocolAgentPlan = z.infer<typeof ProtocolAgentPlanSchema>;
export type ProtocolAgentAnswer = z.infer<typeof ProtocolAgentAnswerSchema>;

export type ProtocolAgentToolCall = {
  tool: "retrieve_protocol_context";
  query: string;
  topK: number;
  results: Array<{
    sourcePath: string;
    chunkId: string;
    score: number;
    headingPath?: string[];
  }>;
};

export type ProtocolKnowledgeAgentInput = {
  question: string;
  embeddingClient: EmbeddingClient;
  store: VectorSearchStore;
  llmClient: LlmClient;
  topK?: number;
  maxSearchQueries?: number;
};

export type ProtocolKnowledgeAgentResponse = ProtocolAgentAnswer & {
  plan: ProtocolAgentPlan;
  toolCalls: ProtocolAgentToolCall[];
  sources: Array<{
    sourceNumber: number;
    sourcePath: string;
    chunkId: string;
    score: number;
    headingPath?: string[];
  }>;
};

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

const parseJsonWithSchema = <T>(raw: string, schema: z.ZodType<T>, label: string): T => {
  try {
    return schema.parse(JSON.parse(extractJsonObject(raw)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid protocol agent ${label}: ${reason}`);
  }
};

const buildPlanPrompt = (question: string): LlmPrompt => ({
  system:
    "You are a protocol knowledge agent planner. Plan retrieval work for protocol, architecture, incident, and engineering documentation. Do not answer the user yet.",
  user: `User question:\n${question}\n\nReturn only valid JSON with this shape:\n{"intent": string, "searchQueries": string[], "requiredContext": string[], "needsClarification": boolean, "clarifyingQuestion"?: string}\n\nRules:\n- Write 1-5 focused search queries that can retrieve useful protocol docs.\n- Include architecture terms, component names, or operational terms from the question.\n- Set needsClarification=true only if the question cannot be attempted without more detail.`,
});

const buildAnswerPrompt = ({
  question,
  plan,
  evidence,
}: {
  question: string;
  plan: ProtocolAgentPlan;
  evidence: SearchResult[];
}): LlmPrompt => {
  const context = evidence
    .map(
      ({ chunk, score }, index) =>
        `[${index + 1}] Source: ${chunk.sourcePath}\nHeading: ${chunk.headingPath?.join(" > ") ?? "n/a"}\nScore: ${score.toFixed(4)}\nContext:\n${chunk.text}`,
    )
    .join("\n\n---\n\n");

  return {
    system:
      "You are a protocol knowledge agent for an engineering team. Answer from retrieved evidence only. Be precise, cite sources, and call out missing documentation instead of guessing.",
    user: `User question:\n${question}\n\nAgent plan:\n${JSON.stringify(plan, null, 2)}\n\nRetrieved evidence:\n${context || "No evidence retrieved."}\n\nReturn only valid JSON with this shape:\n{"answer": string, "confidence": "low" | "medium" | "high", "citations": [{"sourceNumber": number}], "missingContext": boolean, "missingDocs": string[], "nextActions": string[]}\n\nRules:\n- Cite evidence in the answer with [1], [2], etc.\n- Use only retrieved evidence.\n- If evidence is weak or absent, set missingContext=true and list the missing docs.\n- nextActions should be concrete, such as docs to add, logs to inspect, or owners to ask.`,
  };
};

const retrieveForQuery = async ({
  query,
  embeddingClient,
  store,
  topK,
}: {
  query: string;
  embeddingClient: EmbeddingClient;
  store: VectorSearchStore;
  topK: number;
}): Promise<SearchResult[]> => {
  const [embedding] = await embeddingClient.embed([query]);
  return store.search(embedding, topK);
};

const dedupeEvidence = (toolCalls: ProtocolAgentToolCall[], rawResults: SearchResult[]): SearchResult[] => {
  const bestByChunkId = new Map<string, SearchResult>();
  for (const result of rawResults) {
    const existing = bestByChunkId.get(result.chunk.id);
    if (!existing || result.score > existing.score) {
      bestByChunkId.set(result.chunk.id, result);
    }
  }

  const evidence = [...bestByChunkId.values()].sort((left, right) => right.score - left.score);
  const allowedChunkIds = new Set(evidence.map(({ chunk }) => chunk.id));

  for (const toolCall of toolCalls) {
    toolCall.results = toolCall.results.filter(({ chunkId }) => allowedChunkIds.has(chunkId));
  }

  return evidence;
};

export const runProtocolKnowledgeAgent = async ({
  question,
  embeddingClient,
  store,
  llmClient,
  topK = 4,
  maxSearchQueries = 3,
}: ProtocolKnowledgeAgentInput): Promise<ProtocolKnowledgeAgentResponse> => {
  const rawPlan = await llmClient.answer(buildPlanPrompt(question));
  const plan = parseJsonWithSchema(rawPlan, ProtocolAgentPlanSchema, "plan");
  const searchQueries = plan.searchQueries.slice(0, maxSearchQueries);

  if (plan.needsClarification) {
    return {
      answer: plan.clarifyingQuestion ?? "I need more context before I can answer.",
      confidence: "low",
      citations: [],
      missingContext: true,
      missingDocs: plan.requiredContext,
      nextActions: ["Clarify the question or provide the missing protocol documents."],
      plan,
      toolCalls: [],
      sources: [],
    };
  }

  const toolCalls: ProtocolAgentToolCall[] = [];
  const rawResults: SearchResult[] = [];

  for (const query of searchQueries) {
    const results = await retrieveForQuery({ query, embeddingClient, store, topK });
    rawResults.push(...results);
    toolCalls.push({
      tool: "retrieve_protocol_context",
      query,
      topK,
      results: results.map(({ chunk, score }) => ({
        sourcePath: chunk.sourcePath,
        chunkId: chunk.id,
        score,
        headingPath: chunk.headingPath,
      })),
    });
  }

  const evidence = dedupeEvidence(toolCalls, rawResults);
  const rawAnswer = await llmClient.answer(buildAnswerPrompt({ question, plan, evidence }));
  const answer = parseJsonWithSchema(rawAnswer, ProtocolAgentAnswerSchema, "answer");

  return {
    ...answer,
    plan,
    toolCalls,
    sources: evidence.map(({ chunk, score }, index) => ({
      sourceNumber: index + 1,
      sourcePath: chunk.sourcePath,
      chunkId: chunk.id,
      score,
      headingPath: chunk.headingPath,
    })),
  };
};
