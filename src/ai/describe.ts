import { blobToBase64 } from '../photos/process.ts';
import { createClient, describeApiError, type ApiFailure } from './client.ts';
import { ItemSuggestionSchema, type ItemSuggestion } from './schema.ts';

export const SYSTEM_PROMPT = `You catalogue a UK family's children's clothes, shoes and toys for a home inventory app. The parent photographs one item and you fill in its details.

Rules:
- Describe only what the photos show. Read labels, tags and boxes carefully for brand, size and material; if something isn't visible, use null rather than guessing, and list guessed fields in "uncertain".
- Sizes use UK conventions. Clothing ids look like "2-3y" or "6-9m", shoe ids like "k6.5" (UK kids' 6½) or "j2" (UK junior 2), toy age ids like "3y+". Convert EU or US sizes on labels to the nearest UK size, and copy the label text into "sizeOnLabel".
- Condition uses the Vinted scale: new_with_tags only if a shop tag is attached; new_without_tags if unworn; very_good for barely worn with no flaws; good for normal wear; satisfactory for clear flaws. Mention any flaws in "conditionNotes".
- Write in British English ("colour", "jumper", "trainers").
- Never include people, faces, names or anything else about the child; describe the item only.`;

/** Models that accept server-side refusal fallback (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

export type DescribeResult = { ok: true; suggestion: ItemSuggestion } | ({ ok: false } & ApiFailure) | {
  ok: false;
  reason: 'refused' | 'unreadable';
  message: string;
};

/**
 * Sends the ~1000px photo copies to Claude and returns structured fields.
 * Runs at low effort: reading labels and describing clothes doesn't need deep
 * thinking, and this keeps each item to roughly a penny.
 */
export async function describeItem(
  apiKey: string,
  model: string,
  photos: Blob[],
  fetchImpl?: typeof fetch,
): Promise<DescribeResult> {
  try {
    const client = await createClient(apiKey, fetchImpl, 90_000);
    const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod');
    const images = await Promise.all(photos.map(blobToBase64));
    const useFallback = FALLBACK_MODELS.has(model);

    // create() rather than parse(), so a refusal or cut-off answer is checked
    // before the JSON is read; the schema is still enforced by the API and
    // validated again below.
    const response = await client.beta.messages.create({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: betaZodOutputFormat(ItemSuggestionSchema) },
      ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((data) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data },
            })),
            {
              type: 'text' as const,
              text:
                images.length === 1
                  ? 'Fill in the details for the item in this photo.'
                  : `These ${images.length} photos show the same item. Fill in its details.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return { ok: false, reason: 'refused', message: 'Claude declined to describe this photo. Fill it in yourself.' };
    }
    const unreadable = {
      ok: false,
      reason: 'unreadable',
      message: 'Claude’s answer was incomplete. Try again or fill it in yourself.',
    } as const;
    if (response.stop_reason === 'max_tokens') return unreadable;
    const text = response.content.find((block) => block.type === 'text')?.text;
    const parsed = ItemSuggestionSchema.safeParse(safeJson(text));
    return parsed.success ? { ok: true, suggestion: parsed.data } : unreadable;
  } catch (error) {
    return { ok: false, ...(await describeApiError(error, model)) };
  }
}

function safeJson(text: string | undefined): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}
