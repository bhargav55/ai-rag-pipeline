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
    user: `Context:\n${context}\n\nQuestion:\n${question}\n\nAnswer rules:\n- Cite sources like [1], [2].\n- Use only the context above.\n- If unsure, say the context is insufficient.`,
  };
};
