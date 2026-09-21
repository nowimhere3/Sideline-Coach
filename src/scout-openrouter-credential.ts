export const SCOUT_OPENROUTER_SECRET_KEY = 'sidelineCoach.scout.openrouterApiKey';

export interface SecureSecretStore {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export interface ScoutOpenRouterCredentialState {
  readonly configured: boolean;
}

/**
 * The only durable owner of Dad Mode's OpenRouter credential. Callers receive
 * boolean state for presentation; only the trusted execution resolver can read
 * the value back into process memory.
 */
export class ScoutOpenRouterCredentialStore {
  constructor(private readonly secrets: SecureSecretStore) {}

  async status(): Promise<ScoutOpenRouterCredentialState> {
    try {
      return { configured: Boolean(await this.secrets.get(SCOUT_OPENROUTER_SECRET_KEY)) };
    } catch {
      throw new Error('Could not read the secure OpenRouter credential state.');
    }
  }

  async save(apiKey: string): Promise<ScoutOpenRouterCredentialState> {
    const value = apiKey.trim();
    if (!value || value.length > 4096) {
      throw new Error('Enter a valid OpenRouter API key.');
    }
    try {
      await this.secrets.store(SCOUT_OPENROUTER_SECRET_KEY, value);
    } catch {
      throw new Error('Could not save the OpenRouter API key securely.');
    }
    return { configured: true };
  }

  async disconnect(): Promise<ScoutOpenRouterCredentialState> {
    try {
      await this.secrets.delete(SCOUT_OPENROUTER_SECRET_KEY);
    } catch {
      throw new Error('Could not delete the secure OpenRouter API key.');
    }
    return { configured: false };
  }

  /** Trusted extension-runtime seam. Never expose this value to browser state. */
  async resolveForExecution(): Promise<string | undefined> {
    try {
      return await this.secrets.get(SCOUT_OPENROUTER_SECRET_KEY);
    } catch {
      throw new Error('Could not retrieve the secure Scout credential for execution.');
    }
  }
}

export interface ScoutExecutionEnvironment {
  readonly env: NodeJS.ProcessEnv;
  readonly secretValues: readonly string[];
  readonly openRouterCredentialConfigured: boolean;
}

/**
 * One credential precedence contract for Combine and Formation:
 * trusted runtime secret first, standalone CLI process environment second,
 * otherwise absent so the existing executor fails closed before provider use.
 */
export function createScoutExecutionEnvironment(
  runtimeOpenRouterApiKey: string | undefined,
  environment: NodeJS.ProcessEnv = process.env
): ScoutExecutionEnvironment {
  const runtimeCredential = runtimeOpenRouterApiKey?.trim();
  const environmentCredential = environment.OPENROUTER_API_KEY?.trim();
  const credential = runtimeCredential || environmentCredential;
  const env = { ...environment };
  if (credential) env.OPENROUTER_API_KEY = credential;
  else delete env.OPENROUTER_API_KEY;
  return {
    env,
    secretValues: credential ? [credential] : [],
    openRouterCredentialConfigured: Boolean(credential)
  };
}
