import { z } from "zod";

const AskRequestSchema = z.object({
  question: z.string().trim().min(1),
  topK: z.number().int().positive().max(20).default(3),
});

const AgentAskRequestSchema = AskRequestSchema.extend({
  topK: z.number().int().positive().max(20).default(4),
  maxTurns: z.number().int().positive().max(12).default(6),
  tenantId: z.string().trim().min(1).optional(),
  siteId: z.string().trim().min(1).optional(),
});

type AskRequest = z.infer<typeof AskRequestSchema>;
type AgentAskRequest = z.infer<typeof AgentAskRequestSchema>;

type ReadinessResult = {
  ok: boolean;
  checks: { name: string; ok: boolean; message?: string }[];
};

type AskHandlerDeps = {
  answer(input: AskRequest): Promise<unknown>;
  agentAnswer?(input: AgentAskRequest): Promise<unknown>;
  readiness?(): Promise<ReadinessResult>;
};

const corsHeaders = {
  "access-control-allow-headers": "content-type,x-request-id",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-origin": "*",
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });

export const handleHttpRequest = async (request: Request, deps: AskHandlerDeps): Promise<Response> => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method === "GET" && url.pathname === "/healthz") {
    return jsonResponse({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/readyz") {
    if (!deps.readiness) {
      return jsonResponse({ ok: false, checks: [{ name: "readyz", ok: false, message: "Readiness checker not configured" }] }, 503);
    }
    const readiness = await deps.readiness();
    return jsonResponse(readiness, readiness.ok ? 200 : 503);
  }

  if (request.method === "POST" && url.pathname === "/ask") {
    try {
      const body = await request.json();
      const input = AskRequestSchema.parse(body);
      return jsonResponse(await deps.answer(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: "Invalid request", message }, 400);
    }
  }

  if (request.method === "POST" && url.pathname === "/agent/ask") {
    if (!deps.agentAnswer) {
      return jsonResponse({ error: "Agent endpoint not configured" }, 503);
    }

    try {
      const body = await request.json();
      const input = AgentAskRequestSchema.parse(body);
      return jsonResponse(await deps.agentAnswer(input));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: "Invalid request", message }, 400);
    }
  }

  return jsonResponse({ error: "Not found" }, 404);
};
