// POST application/json ExtractTasksRequest → 200 ExtractTasksResponse { captureId, tasks, unparsed }
// The model returns local wall-clock strings. The device converts them with the user's time zone
// and does all scheduling itself (calendar data never reaches this server).
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';

import { apiError, json, log, rejectIfNotAllowed, rejectIfOverDailyCap } from '../_shared/http.ts';
import { extractionModel, openai, reasoningEffort } from '../_shared/openai.ts';
import { ExtractTasksRequest, type ExtractTasksResponse } from '../_shared/task-schema.ts';
import { isValidTimeZone } from '../_shared/zoned-time.ts';
import { ExtractionError, extractTasks } from './extract.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return apiError('bad_request', 'Use POST.', 405);

    const denied = rejectIfNotAllowed(ctx);
    if (denied) return denied;

    const parsed = ExtractTasksRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return apiError('bad_request', `Invalid request: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim());
    }
    const input = parsed.data;
    if (!isValidTimeZone(input.timeZone)) return apiError('bad_request', 'Unknown time zone.');

    // Typed input has no capture yet: record it (this also counts toward the daily cap).
    let captureId = input.captureId;
    if (captureId === null) {
      const capped = await rejectIfOverDailyCap(ctx);
      if (capped) return capped;
      const { data, error } = await ctx.supabase
        .from('captures')
        .insert({ transcript: input.transcript })
        .select('id')
        .single();
      if (error || !data) {
        log('extract-tasks', 'insert_failed', { code: error?.code ?? null });
        return apiError('internal', 'Could not save the capture.');
      }
      captureId = data.id as string;
    } else {
      // RLS makes other users' captures invisible, so this is also the ownership check.
      const { data, error } = await ctx.supabase
        .from('captures')
        .select('id, transcript')
        .eq('id', captureId)
        .maybeSingle();
      if (error || !data) return apiError('bad_request', 'Unknown capture.');
      if (data.transcript !== input.transcript) {
        // The user edited the transcript before re-running: keep history in sync.
        await ctx.supabase.from('captures').update({ transcript: input.transcript }).eq('id', captureId);
      }
    }

    const started = Date.now();
    const model = extractionModel();
    try {
      const result = await extractTasks(
        openai(),
        input.transcript,
        {
          nowMs: Date.parse(input.now),
          timeZone: input.timeZone,
          dayStart: input.dayStart.slice(0, 5),
          dayEnd: input.dayEnd.slice(0, 5),
          locale: input.locale,
        },
        { model, reasoningEffort: reasoningEffort() }
      );
      log('extract-tasks', 'ok', {
        ms: Date.now() - started,
        model,
        chars: input.transcript.length,
        tasks: result.tasks.length,
        unparsed: result.unparsed.length,
      });
      return json<ExtractTasksResponse>({ captureId, ...result });
    } catch (error) {
      if (error instanceof ExtractionError) {
        log('extract-tasks', error.code, { ms: Date.now() - started, model, status: error.status });
        const message =
          error.code === 'upstream_error'
            ? 'The AI service is unavailable. Please try again.'
            : "Couldn't turn that into tasks. Try rephrasing.";
        return apiError(error.code, message);
      }
      log('extract-tasks', 'internal', { ms: Date.now() - started });
      return apiError('internal', 'Something went wrong.');
    }
  }),
};
