/**
 * Agent module types. FE-safe: plain TypeScript, no runtime imports.
 */

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

/** A tool the agent can call, as described to the model. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  /** Text the model will read. Keep it short. */
  text: string;
  /** Optional base64 PNG (screenshots). Sent only to vision-capable providers. */
  imageBase64?: string;
  isError?: boolean;
}

/** Provider-neutral conversation message. */
export type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; result: ToolResult };

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface AgentStep {
  call: ToolCall;
  result: ToolResult;
}

export interface AgentResult {
  success: boolean;
  summary: string;
  steps: AgentStep[];
  /** True if the run was cancelled via its AbortSignal. */
  cancelled?: boolean;
}

/** Which model backend to use. Serializable, so the FE can let users pick one. */
export type ProviderConfig =
  /** Claude via the Agent SDK: uses the Claude plan you're logged in with (Claude Code login or CLAUDE_CODE_OAUTH_TOKEN). */
  | { type: 'claude-agent-sdk'; model?: string }
  /** Claude Messages API with ANTHROPIC_API_KEY, billed to the Console organization. */
  | { type: 'claude-api'; model?: string; maxTokens?: number }
  /** Local Ollama; needs a tool-calling model (e.g. qwen3:8b). */
  | { type: 'ollama'; model?: string; host?: string; vision?: boolean };

export type ProviderType = ProviderConfig['type'];

export interface AgentModuleOptions {
  /** Used when a request doesn't specify a provider. */
  defaultProvider: ProviderConfig;
  /** For 'claude-api'. Default: ANTHROPIC_API_KEY. */
  anthropicApiKey?: string;
  /** For 'ollama'. Default: http://localhost:11434 */
  ollamaHost?: string;
  /** For 'claude-agent-sdk': drop ANTHROPIC_API_KEY from the child process so the plan is billed. Default true. */
  agentSdkUseSubscription?: boolean;
}
