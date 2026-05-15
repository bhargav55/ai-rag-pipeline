import type { RagTraceEvent, RagTracer } from "./types";

const defaultNowMs = (): number => performance.now();

export const createConsoleJsonTracer = ({
  requestId = crypto.randomUUID(),
  model,
}: {
  requestId?: string;
  model?: string;
} = {}): RagTracer => ({
  requestId,
  model,
  nowMs: defaultNowMs,
  log(event: RagTraceEvent) {
    console.error(JSON.stringify(event));
  },
});
