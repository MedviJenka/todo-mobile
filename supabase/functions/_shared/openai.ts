import OpenAI from 'openai';

let client: OpenAI | null = null;

/** Lazily created so a missing key fails the request, not the worker boot. */
export function openai(): OpenAI {
  if (!client) {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    client = new OpenAI({ apiKey, maxRetries: 1, timeout: 60_000 });
  }
  return client;
}

/** Changing a model is a `supabase secrets set`, not an app release. */
export function extractionModel(): string {
  return Deno.env.get('OPENAI_MODEL') || 'gpt-6.1-terra';
}

export function sttModel(): string {
  return Deno.env.get('OPENAI_STT_MODEL') || 'gpt-transcribe';
}

export type Effort = 'minimal' | 'low' | 'medium' | 'high';

/** `OPENAI_REASONING_EFFORT=off` for models that reject the reasoning parameter. */
export function reasoningEffort(): Effort | null {
  const value = (Deno.env.get('OPENAI_REASONING_EFFORT') || 'low').toLowerCase();
  if (value === 'off') return null;
  return (['minimal', 'low', 'medium', 'high'] as const).find((e) => e === value) ?? 'low';
}
