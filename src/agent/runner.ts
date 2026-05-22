import { z } from "zod";
import type { LlmClient, LlmPrompt, SearchResult } from "../types";
import { ToolRegistry } from "./tool";

const FinalAnswerSchema = z.object({
  answer: z.string().min(1),
  confidence: z.enum(["low", "medium", "high"]),
  citations: z.array(z.object({ sourceNumber: z.number().int().positive() })),
  missingContext: z.boolean(),
  missingDocs: z.array(z.string().min(1)).default([]),
  nextActions: z.array(z.string().min(1)).default([]),
});

const AgentActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("tool_call"),
    reasoning: z.string().min(1),
    toolName: z.string().min(1),
    toolInput: z.unknown(),
  }),
  z.object({
    action: z.literal("final_answer"),
    reasoning: z.string().min(1),
    finalAnswer: FinalAnswerSchema,
  }),
]);

export type AgentFinalAnswer = z.infer<typeof FinalAnswerSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;

export type AgentObservation = {
  turn: number;
  toolName: string;
  toolInput: unknown;
  result: unknown;
};

export type AgentToolCallRecord = {
  turn: number;
  toolName: string;
  toolInput: unknown;
  result: unknown;
};

export type AgentRunnerInput = {
  question: string;
  llmClient: LlmClient;
  tools: ToolRegistry;
  maxTurns?: number;
};

export type AgentRunnerResponse = AgentFinalAnswer & {
  turns: number;
  toolCalls: AgentToolCallRecord[];
  sources: Array<{
    sourceNumber: number;
    sourcePath: string;
    chunkId: string;
    score: number;
    headingPath?: string[];
  }>;
};

const publicToolResult = (result: unknown): unknown => {
  if (typeof result === "object" && result !== null && "chunks" in result) {
    const { query, chunks } = result as { query?: unknown; chunks?: unknown };
    return { query, chunks };
  }

  return result;
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

const parseAgentAction = (raw: string): AgentAction => {
  try {
    return AgentActionSchema.parse(JSON.parse(extractJsonObject(raw)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid agent action: ${reason}`);
  }
};

const isSearchResult = (value: unknown): value is SearchResult =>
  typeof value === "object" &&
  value !== null &&
  "score" in value &&
  "chunk" in value &&
  typeof (value as { chunk?: { id?: unknown } }).chunk?.id === "string";

const collectRawSearchResults = (observations: AgentObservation[]): SearchResult[] => {
  const results: SearchResult[] = [];

  for (const observation of observations) {
    const rawResults = (observation.result as { rawResults?: unknown }).rawResults;
    if (!Array.isArray(rawResults)) continue;
    results.push(...rawResults.filter(isSearchResult));
  }

  return results;
};

const dedupeSearchResults = (results: SearchResult[]): SearchResult[] => {
  const bestByChunkId = new Map<string, SearchResult>();

  for (const result of results) {
    const existing = bestByChunkId.get(result.chunk.id);
    if (!existing || result.score > existing.score) {
      bestByChunkId.set(result.chunk.id, result);
    }
  }

  return [...bestByChunkId.values()].sort((left, right) => right.score - left.score);
};

const toSources = (results: SearchResult[]): AgentRunnerResponse["sources"] =>
  results.map(({ chunk, score }, index) => ({
    sourceNumber: index + 1,
    sourcePath: chunk.sourcePath,
    chunkId: chunk.id,
    score,
    headingPath: chunk.headingPath,
  }));

const buildEvidenceContext = (results: SearchResult[]): string =>
  results
    .map(
      ({ chunk, score }, index) =>
        `[${index + 1}] Source: ${chunk.sourcePath}\nHeading: ${chunk.headingPath?.join(" > ") ?? "n/a"}\nScore: ${score.toFixed(4)}\nContext:\n${chunk.text}`,
    )
    .join("\n\n---\n\n");

const buildPrompt = ({
  question,
  tools,
  observations,
}: {
  question: string;
  tools: ToolRegistry;
  observations: AgentObservation[];
}): LlmPrompt => {
  const evidence = dedupeSearchResults(collectRawSearchResults(observations));

  return {
    system:
      "You are a protocol knowledge agent. Use tools when protocol-specific context is needed. Answer only from tool observations. Do not invent facts.",
    user: `User question:\n${question}\n\nAvailable tools:\n${JSON.stringify(tools.descriptors(), null, 2)}\n\nTool observations so far:\n${JSON.stringify(
      observations.map(({ turn, toolName, toolInput, result }) => ({
        turn,
        toolName,
        toolInput,
        result: publicToolResult(result),
      })),
      null,
      2,
    )}\n\nNumbered evidence available for final answers:\n${buildEvidenceContext(evidence) || "No evidence retrieved yet."}\n\nReturn only valid JSON in one of these shapes:\n\nTool call:\n{"action":"tool_call","reasoning":string,"toolName":string,"toolInput":object}\n\nFinal answer:\n{"action":"final_answer","reasoning":string,"finalAnswer":{"answer":string,"confidence":"low"|"medium"|"high","citations":[{"sourceNumber":number}],"missingContext":boolean,"missingDocs":string[],"nextActions":string[]}}\n\nRules:\n- Use retrieve_protocol_context before answering protocol-specific questions unless observations already contain enough evidence.\n- Cite sources using source numbers shown in numbered evidence.\n- If evidence is missing or insufficient, finalAnswer.missingContext must be true and missingDocs must list what is needed.\n- Never cite a source number that is not present in numbered evidence.`,
  };
};

const validateFinalAnswer = (answer: AgentFinalAnswer, sources: AgentRunnerResponse["sources"]): void => {
  const sourceNumbers = new Set(sources.map(({ sourceNumber }) => sourceNumber));
  const invalidCitation = answer.citations.find(({ sourceNumber }) => !sourceNumbers.has(sourceNumber));
  if (invalidCitation) {
    throw new Error(`Final answer cited unavailable source number: ${invalidCitation.sourceNumber}`);
  }

  if (!answer.missingContext && sources.length > 0 && answer.citations.length === 0) {
    throw new Error("Final answer must cite at least one retrieved source when missingContext=false");
  }

  if (sources.length === 0 && !answer.missingContext) {
    throw new Error("Final answer must set missingContext=true when no evidence was retrieved");
  }
};

export const runAgent = async ({
  question,
  llmClient,
  tools,
  maxTurns = 6,
}: AgentRunnerInput): Promise<AgentRunnerResponse> => {
  const observations: AgentObservation[] = [];
  const toolCalls: AgentToolCallRecord[] = [];

  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const action = parseAgentAction(await llmClient.answer(buildPrompt({ question, tools, observations })));

    if (action.action === "final_answer") {
      const sources = toSources(dedupeSearchResults(collectRawSearchResults(observations)));
      validateFinalAnswer(action.finalAnswer, sources);
      return {
        ...action.finalAnswer,
        turns: turn,
        toolCalls,
        sources,
      };
    }

    if (!tools.has(action.toolName)) {
      throw new Error(`Model requested unknown tool: ${action.toolName}`);
    }

    const result = await tools.execute(action.toolName, action.toolInput);
    const observation = {
      turn,
      toolName: action.toolName,
      toolInput: action.toolInput,
      result,
    };

    observations.push(observation);
    toolCalls.push({
      ...observation,
      result: publicToolResult(result),
    });
  }

  throw new Error(`Agent exceeded maxTurns=${maxTurns} without producing a final answer`);
};
