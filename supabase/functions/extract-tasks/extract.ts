/**
 * Extraction core, shared by the extract-tasks function and supabase/evals/run.ts so the eval
 * scores exactly the code that ships.
 */
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';

import {
  ExtractedTask,
  MAX_TASK_MINUTES,
  MIN_TASK_MINUTES,
  ModelExtractionResult,
  type ExtractionResult,
} from '../_shared/task-schema.ts';
import { localDateTimeToEpoch, parseLocalDateTime } from '../_shared/zoned-time.ts';
import { buildInstructions, buildUserMessage, type PromptContext } from './prompt.ts';

export type ExtractionErrorCode = 'model_refused' | 'model_incomplete' | 'upstream_error';

export class ExtractionError extends Error {
  constructor(
    readonly code: ExtractionErrorCode,
    message: string,
    readonly status: number | null = null
  ) {
    super(message);
  }
}

export type ExtractOptions = {
  model: string;
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | null;
};

export async function extractTasks(
  client: OpenAI,
  transcript: string,
  context: PromptContext,
  options: ExtractOptions
): Promise<ExtractionResult> {
  let response;
  try {
    response = await client.responses.parse({
      model: options.model,
      ...(options.reasoningEffort && { reasoning: { effort: options.reasoningEffort } }),
      instructions: buildInstructions(context),
      input: [{ role: 'user', content: buildUserMessage(transcript) }],
      text: { format: zodTextFormat(ModelExtractionResult, 'task_extraction') },
      // Don't keep transcripts on OpenAI's side longer than the request needs.
      store: false,
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new ExtractionError('upstream_error', error.message, error.status ?? null);
    }
    // Output that doesn't match the schema surfaces as a parse error.
    throw new ExtractionError('model_incomplete', 'Model output did not match the schema.');
  }

  if (response.status === 'incomplete') {
    throw new ExtractionError(
      'model_incomplete',
      `Model response incomplete: ${response.incomplete_details?.reason ?? 'unknown'}`
    );
  }
  const refused = response.output.some(
    (item) => item.type === 'message' && item.content.some((part) => part.type === 'refusal')
  );
  if (refused || !response.output_parsed) {
    throw new ExtractionError('model_refused', 'The model declined to process this transcript.');
  }

  return cleanExtraction(response.output_parsed, context.timeZone);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Post-parse clean-up (§6.2): clamp durations, drop empty titles, and move tasks with dates that
 * aren't real calendar dates (e.g. 2026-02-30) to `unparsed`.
 */
export function cleanExtraction(
  raw: z.infer<typeof ModelExtractionResult>,
  timeZone: string
): ExtractionResult {
  const tasks: ExtractedTask[] = [];
  const unparsed = raw.unparsed.map((fragment) => fragment.trim()).filter(Boolean);

  for (const task of raw.tasks) {
    const title = task.title.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!title) continue;

    const dates = [task.fixedStart, task.notBefore, task.deadline];
    if (dates.some((value) => value !== null && parseLocalDateTime(value) === null)) {
      unparsed.push(title);
      continue;
    }

    let notBefore = task.notBefore;
    if (notBefore && task.deadline) {
      const start = localDateTimeToEpoch(notBefore, timeZone, 'startOfDay')!;
      const end = localDateTimeToEpoch(task.deadline, timeZone, 'endOfDay')!;
      if (start >= end) notBefore = null; // contradictory: keep the deadline, it's the safer constraint
    }

    const cleaned = ExtractedTask.safeParse({
      ...task,
      title,
      notes: task.notes?.trim().slice(0, 1000) || null,
      durationMinutes: clamp(Math.round(task.durationMinutes), MIN_TASK_MINUTES, MAX_TASK_MINUTES),
      notBefore,
      // A stated start time always gets a calendar block.
      scheduleToCalendar: task.fixedStart !== null || task.scheduleToCalendar,
    });
    if (cleaned.success) tasks.push(cleaned.data);
    else unparsed.push(title);
  }

  return { tasks: tasks.slice(0, 30), unparsed };
}
