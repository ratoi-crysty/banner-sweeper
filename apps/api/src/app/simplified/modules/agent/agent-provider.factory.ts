import { Inject, Injectable } from '@nestjs/common';
import { AGENT_OPTIONS } from './agent.constants';
import type { AgentProvider } from './interfaces';
import { ClaudeAgentSdkProvider } from './providers/claude-agent-sdk.provider';
import { ClaudeApiProvider } from './providers/claude-api.provider';
import { OllamaProvider } from './providers/ollama.provider';
import type { AgentModuleOptions, ProviderConfig } from './types';

export function isAgentProvider(value: ProviderConfig | AgentProvider): value is AgentProvider {
  return 'run' in value;
}

/**
 * Turns a serializable ProviderConfig into an AgentProvider, merging the request's settings with the
 * module's (API keys, hosts). The only place that knows the concrete providers. Override it in tests.
 */
@Injectable()
export class AgentProviderFactory {
  constructor(@Inject(AGENT_OPTIONS) private readonly options: AgentModuleOptions) {}

  create(config: ProviderConfig = this.options.defaultProvider): AgentProvider {
    switch (config.type) {
      case 'claude-agent-sdk':
        return new ClaudeAgentSdkProvider({ model: config.model, useSubscription: this.options.agentSdkUseSubscription ?? true });
      case 'claude-api':
        return new ClaudeApiProvider({ apiKey: this.options.anthropicApiKey, model: config.model, maxTokens: config.maxTokens });
      case 'ollama':
        return new OllamaProvider({ host: config.host ?? this.options.ollamaHost, model: config.model, vision: config.vision });
      default:
        return assertNever(config);
    }
  }

  /** A ready provider passes through; a config (or nothing, for the default) is built. */
  resolve(provider?: ProviderConfig | AgentProvider): AgentProvider {
    if (provider === undefined) return this.create();
    return isAgentProvider(provider) ? provider : this.create(provider);
  }
}

function assertNever(config: never): never {
  throw new Error(`Unknown provider type: ${(config as { type: string }).type}`);
}
