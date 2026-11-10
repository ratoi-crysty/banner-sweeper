import { z } from 'zod';
import type { AgentLoopOutcome, AgentProvider, AgentSession, JsonSchema, ToolResult } from '../types/agent.types';

// The Agent SDK is ESM-only; load it lazily so this CommonJS app doesn't need it at startup.
const loadSdk = () => import('@anthropic-ai/claude-agent-sdk');

export interface ClaudeAgentSdkProviderOptions {
  /** e.g. 'claude-sonnet-5-5'. Default: the SDK's default for your plan. */
  model?: string;
  /**
   * Drop ANTHROPIC_API_KEY from the child process so usage is billed to your Claude plan
   * (Claude Code prefers an API key when one is set). Default true.
   */
  useSubscription?: boolean;
  /** Path to a `claude` executable, if you want to use your installed Claude Code. */
  pathToClaudeCodeExecutable?: string;
  /** Print the CLI's stderr (useful when login/auth fails). */
  debug?: boolean;
}

const SERVER = 'browser';

/**
 * Runs the agent through the Claude Agent SDK, so it uses your Claude plan's limits
 * (Pro/Max/…) when you're logged in to Claude Code (`claude` → /login) or have
 * CLAUDE_CODE_OAUTH_TOKEN set (from `claude setup-token`).
 *
 * Only our Playwright actions are exposed; Claude Code's built-in tools (Bash, Read, …) are disabled.
 * The SDK runs its own agent loop, so this implements `run` directly instead of extending ChatAgentProvider.
 */
export class ClaudeAgentSdkProvider implements AgentProvider {
  readonly name = 'claude-agent-sdk';
  readonly vision = true;

  constructor(private readonly opts: ClaudeAgentSdkProviderOptions = {}) {}

  async run(session: AgentSession): Promise<AgentLoopOutcome> {
    const { task, system, tools, maxSteps, signal } = session;
    const { createSdkMcpServer, query, tool } = await loadSdk();

    let callId = 0;

    const server = createSdkMcpServer({
      name: SERVER,
      tools: tools.map((def) =>
        tool(def.name, def.description, toZodShape(def.parameters), async (args) => {
          const result: ToolResult = await session.execute({
            id: `sdk_${++callId}`,
            name: def.name,
            args: args as Record<string, unknown>,
          });

          return {
            isError: result.isError,
            content: [
              {
                type: 'text' as const,
                text: session.finished ? `${result.text}\nTask finished. Stop now.` : result.text,
              },
              ...(result.imageBase64
                ? [{ type: 'image' as const, data: result.imageBase64, mimeType: 'image/png' }]
                : []),
            ],
          };
        }),
      ),
    });

    const env: Record<string, string | undefined> = {
      ...process.env,
      CLAUDE_AGENT_SDK_CLIENT_APP: 'llm-consent-nest/0.1',
    };
    if (this.opts.useSubscription !== false) delete env.ANTHROPIC_API_KEY;

    const abort = new AbortController();

    signal?.addEventListener('abort', () => abort.abort(), { once: true });

    const q = query({
      prompt: task,
      options: {
        systemPrompt: system,
        model: this.opts.model,
        mcpServers: { [SERVER]: server },
        tools: [], // no built-in Claude Code tools
        allowedTools: tools.map((t) => `mcp__${SERVER}__${t.name}`), // no permission prompts
        maxTurns: maxSteps,
        settingSources: [], // ignore ~/.claude settings and CLAUDE.md files
        persistSession: false,
        abortController: abort,
        env,
        pathToClaudeCodeExecutable: this.opts.pathToClaudeCodeExecutable,
        stderr: this.opts.debug ? (d) => process.stderr.write(d) : undefined,
      },
    });

    let text = '';
    try {
      for await (const msg of q) {
        if (msg.type === 'assistant') {
          for (const block of msg.message.content) if (block.type === 'text') text = block.text;
        }
        if (msg.type === 'result') {
          if (msg.subtype !== 'success') text ||= `Agent SDK stopped: ${msg.subtype}`;
          break;
        }
        if (session.finished) break; // `done` was called; don't spend more turns
      }
    } finally {
      abort.abort();
    }
    return { stopReason: text };
  }
}

/** Our tool schemas are flat JSON Schema; the SDK wants a zod raw shape. */
export function toZodShape(schema: JsonSchema): Record<string, z.ZodType> {
  const required = new Set(schema.required ?? []);
  const shape: Record<string, z.ZodType> = {};
  for (const [key, raw] of Object.entries(schema.properties)) {
    const p = raw as { type?: string; enum?: string[]; items?: { type?: string }; description?: string };
    let t: z.ZodType;
    if (p.enum) t = z.enum(p.enum as [string, ...string[]]);
    else if (p.type === 'number' || p.type === 'integer') t = z.number();
    else if (p.type === 'boolean') t = z.boolean();
    else if (p.type === 'array') t = z.array(p.items?.type === 'number' ? z.number() : z.string());
    else t = z.string();
    if (p.description) t = t.describe(p.description);
    shape[key] = required.has(key) ? t : t.optional();
  }
  return shape;
}
