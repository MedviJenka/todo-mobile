/**
 * Extraction eval (PRODUCT_PLAN §13). Runs every golden transcript through the SAME extraction
 * code the function ships, scores each field, and exits non-zero below the threshold.
 * Any model or prompt change has to pass this first.
 *
 *   npm run evals                      (reads supabase/functions/.env)
 *   EVAL_MIN_SCORE=0.95 npm run evals
 */
import { extractTasks } from '../functions/extract-tasks/extract.ts';
import { extractionModel, openai, reasoningEffort } from '../functions/_shared/openai.ts';
import type { ExtractedTask } from '../functions/_shared/task-schema.ts';
import suite from './extraction-cases.json' with { type: 'json' };

type Scalar = string | number | boolean | null;
type ExpectedTask = {
  match: string[];
  durationRange?: [number, number];
} & Partial<Record<ScoredField, Scalar | Scalar[]>>;

type EvalCase = {
  id: string;
  transcript: string;
  expected: ExpectedTask[];
  now?: string;
  timeZone?: string;
  locale?: string;
  dayStart?: string;
  dayEnd?: string;
};

const SCORED_FIELDS = [
  'priority',
  'durationMinutes',
  'fixedStart',
  'notBefore',
  'deadline',
  'preferredWindow',
  'scheduleToCalendar',
] as const;
type ScoredField = (typeof SCORED_FIELDS)[number];

const MIN_SCORE = Number(Deno.env.get('EVAL_MIN_SCORE') ?? 0.9);
const CONCURRENCY = 4;

const stats = new Map<string, { pass: number; total: number }>();
function record(field: string, ok: boolean) {
  const s = stats.get(field) ?? { pass: 0, total: 0 };
  s.total++;
  if (ok) s.pass++;
  stats.set(field, s);
}

const matches = (expected: Scalar | Scalar[], actual: Scalar) =>
  Array.isArray(expected) ? expected.includes(actual) : expected === actual;

function score(testCase: EvalCase, actual: ExtractedTask[]): string[] {
  const failures: string[] = [];
  const countOk = actual.length === testCase.expected.length;
  record('taskCount', countOk);
  if (!countOk) failures.push(`expected ${testCase.expected.length} tasks, got ${actual.length}`);

  const unmatched = [...actual];
  for (const expected of testCase.expected) {
    const index = unmatched.findIndex((task) =>
      expected.match.some((keyword) => task.title.toLowerCase().includes(keyword.toLowerCase()))
    );
    const task = index >= 0 ? unmatched.splice(index, 1)[0] : undefined;
    record('taskFound', !!task);
    if (!task) {
      failures.push(`no task matching ${JSON.stringify(expected.match)}`);
      continue;
    }

    for (const field of SCORED_FIELDS) {
      if (!(field in expected)) continue;
      const ok = matches(expected[field] as Scalar | Scalar[], task[field]);
      record(field, ok);
      if (!ok) failures.push(`"${task.title}".${field}: expected ${JSON.stringify(expected[field])}, got ${JSON.stringify(task[field])}`);
    }
    if (expected.durationRange) {
      const [min, max] = expected.durationRange;
      const ok = task.durationMinutes >= min && task.durationMinutes <= max;
      record('durationMinutes', ok);
      if (!ok) failures.push(`"${task.title}".durationMinutes: expected ${min}–${max}, got ${task.durationMinutes}`);
    }
  }
  return failures;
}

async function runCase(testCase: EvalCase): Promise<{ id: string; ms: number; failures: string[] }> {
  const c = { ...suite.defaults, ...testCase };
  const started = Date.now();
  try {
    const result = await extractTasks(
      openai(),
      c.transcript,
      { nowMs: Date.parse(c.now), timeZone: c.timeZone, dayStart: c.dayStart, dayEnd: c.dayEnd, locale: c.locale },
      { model: extractionModel(), reasoningEffort: reasoningEffort() }
    );
    return { id: c.id, ms: Date.now() - started, failures: score(c, result.tasks) };
  } catch (error) {
    record('taskCount', false);
    return { id: c.id, ms: Date.now() - started, failures: [`error: ${(error as Error).message}`] };
  }
}

const cases = suite.cases as EvalCase[];
console.log(`Model ${extractionModel()} · reasoning ${reasoningEffort() ?? 'off'} · ${cases.length} cases\n`);

const results: Awaited<ReturnType<typeof runCase>>[] = [];
for (let i = 0; i < cases.length; i += CONCURRENCY) {
  results.push(...(await Promise.all(cases.slice(i, i + CONCURRENCY).map(runCase))));
}

for (const r of results) {
  console.log(`${r.failures.length === 0 ? '✓' : '✗'} ${r.id.padEnd(30)} ${String(r.ms).padStart(6)} ms`);
  for (const failure of r.failures) console.log(`    - ${failure}`);
}

let pass = 0;
let total = 0;
console.log('\nField accuracy');
for (const [field, s] of stats) {
  pass += s.pass;
  total += s.total;
  console.log(`  ${field.padEnd(20)} ${((100 * s.pass) / s.total).toFixed(0).padStart(4)}%  (${s.pass}/${s.total})`);
}
const overall = total === 0 ? 0 : pass / total;
const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length / 2)] ?? 0;
console.log(`\nOverall ${(overall * 100).toFixed(1)}% (threshold ${(MIN_SCORE * 100).toFixed(0)}%) · p50 ${p50} ms`);

if (overall < MIN_SCORE) Deno.exit(1);
