/**
 * Single source of truth for the AI contract. Imported by BOTH the app (via
 * src/schemas/ai-schema.ts) and the Edge Functions, so its only import is plain `zod`
 * (each function's deno.json maps "zod" to npm:zod).
 */
import { z } from 'zod';

export const MAX_TRANSCRIPT_CHARS = 5000;
// 180 s at the app's 64 kbps is about 1.5 MB. Low-bitrate files near a higher limit would hold
// hours of billable audio.
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 180;
export const MIN_TASK_MINUTES = 5;
export const MAX_TASK_MINUTES = 480;

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/; // no offset
const LOCAL_DATE_OR_DATE_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
const TIME_OF_DAY = /^\d{2}:\d{2}(:\d{2})?$/;

export const Priority = z.enum(['high', 'medium', 'low']);
export type Priority = z.infer<typeof Priority>;

export const PreferredWindow = z.enum(['morning', 'afternoon', 'evening']);
export type PreferredWindow = z.infer<typeof PreferredWindow>;

/**
 * What the model must return (OpenAI Structured Outputs, strict mode).
 * Every field is required and optional ones are nullable. Only keywords strict mode enforces
 * (pattern, minimum, maximum) are used, so there are no string length limits here. Those are
 * applied after parsing, in `ExtractedTask`.
 */
export const ModelExtractedTask = z.object({
  title: z.string().describe('Short imperative title in the language the speaker used'),
  notes: z.string().nullable().describe('Extra detail the speaker gave, or null'),
  priority: Priority,
  durationMinutes: z.number().int().min(MIN_TASK_MINUTES).max(MAX_TASK_MINUTES),
  fixedStart: z
    .string()
    .regex(LOCAL_DATE_TIME)
    .nullable()
    .describe('Exact local start the speaker stated, YYYY-MM-DDTHH:mm'),
  notBefore: z
    .string()
    .regex(LOCAL_DATE_OR_DATE_TIME)
    .nullable()
    .describe('Earliest local date or date-time to do it'),
  deadline: z
    .string()
    .regex(LOCAL_DATE_OR_DATE_TIME)
    .nullable()
    .describe('Local date or date-time it must be done by'),
  preferredWindow: PreferredWindow.nullable(),
  scheduleToCalendar: z
    .boolean()
    .describe('false for quick errands and shopping items that belong on the list only'),
});

export const ModelExtractionResult = z.object({
  tasks: z.array(ModelExtractedTask),
  unparsed: z.array(z.string()).describe('Fragments that sounded like tasks but could not be acted on'),
});

/** A task after server-side clean-up. This is what the app receives. */
export const ExtractedTask = ModelExtractedTask.extend({
  title: z.string().trim().min(1).max(120),
  notes: z.string().max(1000).nullable(),
});
export type ExtractedTask = z.infer<typeof ExtractedTask>;

export const ExtractionResult = z.object({
  tasks: z.array(ExtractedTask).max(30),
  unparsed: z.array(z.string().max(200)).max(20),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

// ---- HTTP contract: app ⇄ Edge Functions -------------------------------------------------------

export const TranscribeResponse = z.object({
  captureId: z.uuid(),
  transcript: z.string(),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponse>;

export const ExtractTasksRequest = z.object({
  /** null for typed input: the function then records the capture itself. */
  captureId: z.uuid().nullable(),
  transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARS),
  /** The device's current time, ISO-8601 with its UTC offset. */
  now: z.iso.datetime({ offset: true }),
  timeZone: z.string().min(1).max(64),
  dayStart: z.string().regex(TIME_OF_DAY),
  dayEnd: z.string().regex(TIME_OF_DAY),
  /** BCP-47, e.g. "en-GB". A tag shape only: it goes into the model instructions. */
  locale: z.string().max(35).regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/),
});
export type ExtractTasksRequest = z.infer<typeof ExtractTasksRequest>;

export const ExtractTasksResponse = ExtractionResult.extend({
  captureId: z.uuid(),
});
export type ExtractTasksResponse = z.infer<typeof ExtractTasksResponse>;

export const ApiErrorCode = z.enum([
  'unauthorized',
  'forbidden',
  'bad_request',
  'payload_too_large',
  'unsupported_media_type',
  'rate_limited',
  'no_speech',
  'model_refused',
  'model_incomplete',
  'upstream_error',
  'internal',
  'google_disconnected',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiErrorBody = z.object({
  error: ApiErrorCode,
  message: z.string(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

// ---------------------------------------------------------------------------------------------
// google-token: swaps the stored Google refresh token for short-lived Calendar access tokens.
// ---------------------------------------------------------------------------------------------
export const GoogleTokenRequest = z.discriminatedUnion('action', [
  /** After the calendar consent: store the refresh token, then return an access token. */
  z.object({ action: z.literal('connect'), refreshToken: z.string().min(1).max(2048) }),
  /** A fresh access token from the stored refresh token. */
  z.object({ action: z.literal('refresh') }),
  /** Revoke the grant at Google and forget the refresh token. */
  z.object({ action: z.literal('revoke') }),
]);
export type GoogleTokenRequest = z.infer<typeof GoogleTokenRequest>;

export const GoogleAccessToken = z.object({
  accessToken: z.string(),
  /** Seconds until the access token expires. */
  expiresIn: z.number(),
  /** Scopes Google actually granted. Users can untick each Calendar box on the consent screen. */
  scopes: z.array(z.string()).default([]),
});
export type GoogleAccessToken = z.infer<typeof GoogleAccessToken>;

export const GoogleRevokeResponse = z.object({ revoked: z.boolean() });
export type GoogleRevokeResponse = z.infer<typeof GoogleRevokeResponse>;
