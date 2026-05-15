import { createJsonLogger, type Logger } from "./logger";
import type { RagTraceEvent, RagTracer } from "./types";

const defaultNowMs = (): number => performance.now();

export const createLoggerTracer = ({
  requestId = crypto.randomUUID(),
  model,
  logger = createJsonLogger(),
}: {
  requestId?: string;
  model?: string;
  logger?: Logger;
} = {}): RagTracer => ({
  requestId,
  model,
  nowMs: defaultNowMs,
  log(event: RagTraceEvent) {
    const level = event.event === "rag.answer.failed" ? "error" : "info";
    logger[level](event.event, event as unknown as Record<string, unknown>);
  },
});
