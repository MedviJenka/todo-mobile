import { addDays, dateKeyAt, wallClock, weekdayOf } from '../_shared/zoned-time.ts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

export type PromptContext = {
  nowMs: number;
  timeZone: string;
  /** "HH:mm" */
  dayStart: string;
  dayEnd: string;
  locale: string;
};

/**
 * Two weeks of labelled dates. With this table the model looks dates up instead of counting
 * forward, which removes most "next Friday" mistakes.
 *   Mon 2026-11-23 (today) · Tue 2026-11-24 (tomorrow) · … · Mon 2026-11-30 (next week) · …
 */
export function buildDateTable(nowMs: number, timeZone: string, days = 14): string {
  const today = dateKeyAt(nowMs, timeZone);
  const todayWeekday = weekdayOf(today);
  // Monday that starts next week (ISO weeks: Monday–Sunday).
  const daysToNextMonday = ((8 - todayWeekday) % 7) || 7;
  const nextWeekStart = addDays(today, daysToNextMonday);
  const weekAfterStart = addDays(nextWeekStart, 7);

  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDays(today, i);
    const labels: string[] = [];
    if (i === 0) labels.push('today');
    if (i === 1) labels.push('tomorrow');
    if (key < nextWeekStart) labels.push('this week');
    else if (key < weekAfterStart) labels.push('next week');
    lines.push(`${WEEKDAYS[weekdayOf(key)]} ${key} (${labels.join(', ')})`);
  }
  return lines.join('\n');
}

/**
 * The instructions live in SKILL.md next to this file (bundled via `static_files` in
 * supabase/config.toml). `{{name}}` placeholders are filled per request.
 */
const SKILL_TEMPLATE = Deno.readTextFileSync(new URL('./SKILL.md', import.meta.url))
  .replace(/\r\n/g, '\n') // Windows checkouts
  .replace(/^---\n[\s\S]*?\n---\n/, '') // drop the frontmatter
  .trim();

/** Fills `{{name}}` placeholders; a missing value throws so a typo can't ship a broken prompt. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`SKILL.md placeholder {{${key}}} has no value.`);
    return value;
  });
}

export function buildInstructions(ctx: PromptContext): string {
  const now = wallClock(ctx.nowMs, ctx.timeZone);
  return renderTemplate(SKILL_TEMPLATE, {
    now: `${WEEKDAYS[now.weekday]} ${dateKeyAt(ctx.nowMs, ctx.timeZone)} ${pad(now.hour)}:${pad(now.minute)}`,
    timeZone: ctx.timeZone,
    dayStart: ctx.dayStart,
    dayEnd: ctx.dayEnd,
    locale: ctx.locale,
    dateTable: buildDateTable(ctx.nowMs, ctx.timeZone),
  });
}

export function buildUserMessage(transcript: string): string {
  return `Transcript:\n"""\n${transcript}\n"""`;
}
