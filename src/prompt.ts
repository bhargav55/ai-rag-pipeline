import type { LlmPrompt, SearchResult } from "./types";

type BuildRagPromptInput = {
  question: string;
  results: SearchResult[];
};

export const buildRagPrompt = ({ question, results }: BuildRagPromptInput): LlmPrompt => {
  const context = results
    .map(
      ({ chunk, score }, index) =>
        `[${index + 1}] Source: ${chunk.sourcePath}\nDomain: ${chunk.domain}\nScore: ${score.toFixed(4)}\nContext:\n${chunk.text}`,
    )
    .join("\n\n---\n\n");

  return {
    system:
      "You are a precise RAG assistant. You must answer only from the provided context. If the context is insufficient, say what is missing. Do not invent facts. Keep the answer concise and cite sources.",
    user: `Context:\n${context}\n\nQuestion:\n${question}\n\nAnswer rules:\n- Return only valid JSON. No markdown fences. No prose outside JSON.\n- JSON shape: {"answer": string, "confidence": "low" | "medium" | "high", "citations": [{"sourceNumber": number}], "missingContext": boolean}.\n- Cite sources in the answer like [1], [2], and include matching source numbers in citations.\n- Use only the context above.\n- If unsure, set missingContext to true and say the context is insufficient.`,
  };
};
