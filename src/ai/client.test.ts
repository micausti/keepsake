import { describe, expect, it, vi } from 'vitest';
import { checkKeyAndModel } from './client.ts';

function respond(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

describe('checkKeyAndModel', () => {
  it('looks the model up on api.anthropic.com with browser headers', async () => {
    const fetchMock = respond(200, {
      type: 'model',
      id: 'claude-sonnet-5-5',
      display_name: 'Claude Sonnet 5.5',
      created_at: '2026-01-01T00:00:00Z',
    });

    const result = await checkKeyAndModel('sk-ant-test', 'claude-sonnet-5-5', fetchMock);

    expect(result).toEqual({ ok: true, modelName: 'Claude Sonnet 5.5' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.anthropic.com/v1/models/claude-sonnet-5-5');
    // The SDK passes a Headers instance (possibly from another realm in jsdom).
    const headers = init?.headers as Headers;
    const sentKey = headers.get('x-api-key') ?? headers.get('authorization')?.replace(/^Bearer /, '');
    expect(sentKey).toBe('sk-ant-test');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(init?.method).toBe('GET');
  });

  it.each([
    [401, 'auth'],
    [403, 'permission'],
    [404, 'model'],
    [500, 'other'],
  ] as const)('maps HTTP %i to %s', async (status, reason) => {
    const fetchMock = respond(status, { type: 'error', error: { type: 'x', message: 'nope' } });
    const result = await checkKeyAndModel('sk-ant-test', 'claude-sonnet-5-5', fetchMock);
    expect(result).toMatchObject({ ok: false, reason });
  });

  it('reports being offline', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await checkKeyAndModel('sk-ant-test', 'claude-sonnet-5-5', fetchMock);
    expect(result).toMatchObject({ ok: false, reason: 'offline' });
  });
});
