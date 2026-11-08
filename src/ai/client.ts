import type Anthropic from '@anthropic-ai/sdk';

// The SDK is loaded on first use so it doesn't slow down app start-up.
export const loadSdk = async () => (await import('@anthropic-ai/sdk')).default;

/**
 * The app calls the Anthropic API straight from the browser with the user's
 * own key (there is no server). The key stays in this device's IndexedDB and
 * is only ever sent to api.anthropic.com, which the CSP enforces.
 */
export async function createClient(
  apiKey: string,
  fetchImpl?: typeof fetch,
  timeoutMs = 20_000,
): Promise<Anthropic> {
  const AnthropicSdk = await loadSdk();
  return new AnthropicSdk({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: timeoutMs,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

export type ApiFailureReason = 'auth' | 'model' | 'permission' | 'rate_limit' | 'overloaded' | 'offline' | 'other';

export interface ApiFailure {
  reason: ApiFailureReason;
  message: string;
}

/** Turns an SDK error into a reason and a message fit for the screen. */
export async function describeApiError(error: unknown, model: string): Promise<ApiFailure> {
  const AnthropicSdk = await loadSdk();
  if (error instanceof AnthropicSdk.AuthenticationError)
    return { reason: 'auth', message: 'The API key was not accepted. Check it was copied in full.' };
  if (error instanceof AnthropicSdk.NotFoundError)
    return { reason: 'model', message: `The key works, but the model "${model}" was not found.` };
  if (error instanceof AnthropicSdk.PermissionDeniedError)
    return { reason: 'permission', message: 'This key does not have permission to use the API.' };
  if (error instanceof AnthropicSdk.RateLimitError)
    return { reason: 'rate_limit', message: 'Rate limited, or the spend limit was reached. Try again later.' };
  if (error instanceof AnthropicSdk.APIConnectionError)
    return { reason: 'offline', message: 'Could not reach Anthropic. Are you online?' };
  if (error instanceof AnthropicSdk.APIError && error.status === 529)
    return { reason: 'overloaded', message: 'Anthropic is busy right now. Try again in a moment.' };
  if (error instanceof AnthropicSdk.APIError)
    return { reason: 'other', message: `Anthropic returned an error (${error.status ?? 'unknown'}).` };
  return { reason: 'other', message: 'Something went wrong talking to Anthropic.' };
}

export type KeyCheck = { ok: true; modelName: string } | ({ ok: false } & ApiFailure);

/**
 * Checks the key and model id by looking the model up. This is free: it
 * doesn't generate anything, so it costs no tokens.
 */
export async function checkKeyAndModel(apiKey: string, model: string, fetchImpl?: typeof fetch): Promise<KeyCheck> {
  try {
    const client = await createClient(apiKey, fetchImpl);
    const info = await client.models.retrieve(model);
    return { ok: true, modelName: info.display_name };
  } catch (error) {
    return { ok: false, ...(await describeApiError(error, model)) };
  }
}
