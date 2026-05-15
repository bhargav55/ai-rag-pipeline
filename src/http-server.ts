import { z } from "zod";

const AskRequestSchema = z.object({
  question: z.string().trim().min(1),
  topK: z.number().int().positive().max(20).default(3),
});

type AskRequest = z.infer<typeof AskRequestSchema>;

type AskHandlerDeps = {
  answer(input: AskRequest): Promise<unknown>;
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

export const handleHttpRequest = async (request: Request, deps: AskHandlerDeps): Promise<Response> => {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/healthz") {
    return jsonResponse({ ok: true });
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

  return jsonResponse({ error: "Not found" }, 404);
};
