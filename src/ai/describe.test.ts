import { describe as group, expect, it, vi } from 'vitest';
import { describeItem } from './describe.ts';
import type { ItemSuggestion } from './schema.ts';

const suggestion: ItemSuggestion = {
  title: 'Striped long-sleeve top',
  category: 'tops',
  sizeOnLabel: '3-4 years',
  size: '3-4y',
  seasons: ['spring', 'autumn'],
  brand: 'Frugi',
  colour: 'Blue and white',
  material: 'Organic cotton',
  condition: 'good',
  conditionNotes: 'Light bobbling on cuffs',
  description: 'A soft striped top with a round neck.',
  uncertain: ['material'],
};

function apiResponse(body: object, status = 200) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

const message = (text: string, stop_reason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  content: [{ type: 'text', text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1500, output_tokens: 200 },
});

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });

group('describeItem', () => {
  it('sends the photos and returns the structured suggestion', async () => {
    const fetchMock = apiResponse(message(JSON.stringify(suggestion)));
    const result = await describeItem('sk-ant-test', 'claude-sonnet-5-5', [jpeg(), jpeg()], fetchMock);

    expect(result).toEqual({ ok: true, suggestion });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.fallbacks).toBe('default');
    expect((init?.headers as Headers).get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const images = body.messages[0].content.filter((b: { type: string }) => b.type === 'image');
    expect(images).toHaveLength(2);
    expect(images[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: '/9j/2Q==' });
  });

  it('leaves out fallbacks for models that do not support them', async () => {
    const fetchMock = apiResponse(message(JSON.stringify(suggestion)));
    await describeItem('sk-ant-test', 'claude-haiku-5-5', [jpeg()], fetchMock);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.fallbacks).toBeUndefined();
  });

  it('reports a refusal', async () => {
    const result = await describeItem('k', 'claude-sonnet-5-5', [jpeg()], apiResponse(message('', 'refusal')));
    expect(result).toMatchObject({ ok: false, reason: 'refused' });
  });

  it('reports a truncated answer', async () => {
    const result = await describeItem('k', 'claude-sonnet-5-5', [jpeg()], apiResponse(message('{"title":', 'max_tokens')));
    expect(result).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('maps API errors', async () => {
    const fetchMock = apiResponse({ type: 'error', error: { type: 'authentication_error', message: 'bad key' } }, 401);
    const result = await describeItem('k', 'claude-sonnet-5-5', [jpeg()], fetchMock);
    expect(result).toMatchObject({ ok: false, reason: 'auth' });
  });
});
