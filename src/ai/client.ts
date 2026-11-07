import type Anthropic from '@anthropic-ai/sdk';

// The SDK is loaded on first use so it doesn't slow down app start-up.
const loadSdk = async () => (await import('@anthropic-ai/sdk')).default;

/**
 * The app calls the Anthropic API straight from the browser with the user's
 * own key (there is no server). The key stays in this device's IndexedDB and
 * is only ever sent to api.anthropic.com, which the CSP enforces.
 */
export async function createClient(apiKey: string, fetchImpl?: typeof fetch): Promise<Anthropic> {
  const Anthropic = await loadSdk();
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    timeout: 20_000,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}

export type KeyCheck =
  | { ok: true; modelName: string }
  | { ok: false; reason: 'auth' | 'model' | 'permission' | 'rate_limit' | 'offline' | 'other'; message: string };

/**
 * Checks the key and model id by looking the model up. This is free: it
 * doesn't generate anything, so it costs no tokens.
 */
export async function checkKeyAndModel(
  apiKey: string,
  model: string,
  fetchImpl?: typeof fetch,
): Promise<KeyCheck> {
  const Anthropic = await loadSdk();
  try {
    const client = await createClient(apiKey, fetchImpl);
    const info = await client.models.retrieve(model);
    return { ok: true, modelName: info.display_name };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError)
      return { ok: false, reason: 'auth', message: 'The API key was not accepted. Check it was copied in full.' };
    if (error instanceof Anthropic.NotFoundError)
      return { ok: false, reason: 'model', message: `The key works, but the model "${model}" was not found.` };
    if (error instanceof Anthropic.PermissionDeniedError)
      return { ok: false, reason: 'permission', message: 'This key does not have permission to use the API.' };
    if (error instanceof Anthropic.RateLimitError)
      return { ok: false, reason: 'rate_limit', message: 'Rate limited. Try again in a minute.' };
    if (error instanceof Anthropic.APIConnectionError)
      return { ok: false, reason: 'offline', message: 'Could not reach Anthropic. Are you online?' };
    if (error instanceof Anthropic.APIError)
      return { ok: false, reason: 'other', message: `Anthropic returned an error (${error.status ?? 'unknown'}).` };
    return { ok: false, reason: 'other', message: 'Something went wrong checking the key.' };
  }
}
