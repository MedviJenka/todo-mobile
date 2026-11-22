import { ExtractedTask, ExtractionResult, ExtractTasksRequest, TranscribeResponse } from './ai-schema';

const validTask = {
  title: 'Dentist',
  notes: null,
  priority: 'high',
  durationMinutes: 60,
  fixedStart: '2026-11-24T10:00',
  notBefore: null,
  deadline: null,
  preferredWindow: null,
  scheduleToCalendar: true,
};

describe('ExtractedTask', () => {
  it('accepts a well-formed task', () => {
    expect(ExtractedTask.parse(validTask)).toEqual(validTask);
  });

  it('rejects out-of-range durations', () => {
    expect(ExtractedTask.safeParse({ ...validTask, durationMinutes: 600 }).success).toBe(false);
    expect(ExtractedTask.safeParse({ ...validTask, durationMinutes: 2 }).success).toBe(false);
    expect(ExtractedTask.safeParse({ ...validTask, durationMinutes: 30.5 }).success).toBe(false);
  });

  it('rejects dates with offsets or the wrong shape', () => {
    expect(ExtractedTask.safeParse({ ...validTask, fixedStart: '2026-11-24T10:00+01:00' }).success).toBe(false);
    expect(ExtractedTask.safeParse({ ...validTask, fixedStart: '2026-11-24' }).success).toBe(false);
    expect(ExtractedTask.safeParse({ ...validTask, deadline: '2026-11-27' }).success).toBe(true);
    expect(ExtractedTask.safeParse({ ...validTask, deadline: 'Friday' }).success).toBe(false);
  });

  it('rejects empty and overlong titles', () => {
    expect(ExtractedTask.safeParse({ ...validTask, title: '   ' }).success).toBe(false);
    expect(ExtractedTask.safeParse({ ...validTask, title: 'x'.repeat(121) }).success).toBe(false);
  });

  it('requires every field (Structured Outputs: nullable, not optional)', () => {
    const { notes: _notes, ...withoutNotes } = validTask;
    expect(ExtractedTask.safeParse(withoutNotes).success).toBe(false);
  });
});

describe('function contract', () => {
  it('validates extract-tasks requests', () => {
    const request = {
      captureId: null,
      transcript: 'Buy milk',
      now: '2026-11-23T08:40:00+01:00',
      timeZone: 'Europe/Berlin',
      dayStart: '09:00',
      dayEnd: '20:00:00',
      locale: 'en-GB',
    };
    expect(ExtractTasksRequest.safeParse(request).success).toBe(true);
    expect(ExtractTasksRequest.safeParse({ ...request, now: '2026-11-23T08:40:00' }).success).toBe(false);
    expect(ExtractTasksRequest.safeParse({ ...request, transcript: 'x'.repeat(5001) }).success).toBe(false);
    expect(ExtractTasksRequest.safeParse({ ...request, captureId: 'not-a-uuid' }).success).toBe(false);
  });

  it('validates responses', () => {
    expect(ExtractionResult.safeParse({ tasks: [validTask], unparsed: [] }).success).toBe(true);
    expect(
      TranscribeResponse.safeParse({ captureId: '1b4e28ba-2fa1-4d3b-a3f5-ef19b5a7633b', transcript: '' }).success
    ).toBe(true);
  });
});
