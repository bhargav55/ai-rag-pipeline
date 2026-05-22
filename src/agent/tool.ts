import { z } from "zod";

export type AgentToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  execute(input: unknown): Promise<unknown>;
};

export type ToolDescriptor = {
  name: string;
  description: string;
  inputJsonSchema: unknown;
};

export class ToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();

  constructor(tools: AgentToolDefinition[]) {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Duplicate agent tool registered: ${tool.name}`);
      }
      this.tools.set(tool.name, tool);
    }
  }

  descriptors(): ToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputJsonSchema: z.toJSONSchema(tool.inputSchema),
    }));
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  async execute(name: string, input: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown agent tool: ${name}`);
    }

    const parsedInput = tool.inputSchema.parse(input);
    return tool.execute(parsedInput);
  }
}
