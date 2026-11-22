import {
  addDays,
  dateKeyAt,
  epochAt,
  formatDeadline,
  localDateTimeToEpoch,
  parseLocalDateTime,
  parseTimeOfDay,
  startOfZonedDay,
  toOffsetIso,
  wallClock,
  zonedToEpoch,
  zoneOffsetMinutes,
} from './time';

describe('zoned time', () => {
  it('converts wall-clock time to instants in both offsets', () => {
    expect(zonedToEpoch(2026, 11, 23, 8, 40, 'Europe/Berlin')).toBe(Date.UTC(2026, 10, 23, 7, 40));
    expect(zonedToEpoch(2026, 7, 1, 8, 40, 'Europe/Berlin')).toBe(Date.UTC(2026, 6, 1, 6, 40));
    expect(zonedToEpoch(2026, 11, 23, 8, 40, 'America/New_York')).toBe(Date.UTC(2026, 10, 23, 13, 40));
    expect(zonedToEpoch(2026, 11, 23, 8, 40, 'Asia/Kathmandu')).toBe(Date.UTC(2026, 10, 23, 2, 55));
  });

  it('moves a time inside the spring-forward gap forward', () => {
    // 02:30 does not exist on 28 Mar 2027 in Berlin → 03:30 CEST (01:30Z)
    expect(zonedToEpoch(2027, 3, 28, 2, 30, 'Europe/Berlin')).toBe(Date.UTC(2027, 2, 28, 1, 30));
  });

  it('reads offsets and wall clocks', () => {
    expect(zoneOffsetMinutes(Date.UTC(2026, 10, 23), 'Europe/Berlin')).toBe(60);
    expect(zoneOffsetMinutes(Date.UTC(2026, 6, 1), 'America/New_York')).toBe(-240);
    expect(wallClock(Date.UTC(2026, 10, 22, 23, 30), 'Europe/Berlin')).toMatchObject({
      year: 2026,
      month: 11,
      day: 23,
      hour: 0,
      minute: 30,
      weekday: 1,
    });
  });

  it('finds the start of a DST day', () => {
    const noon = zonedToEpoch(2027, 3, 28, 12, 0, 'Europe/Berlin');
    expect(startOfZonedDay(noon, 'Europe/Berlin')).toBe(Date.UTC(2027, 2, 27, 23, 0));
    expect(epochAt('2027-03-28', 24 * 60, 'Europe/Berlin')).toBe(Date.UTC(2027, 2, 28, 22, 0));
  });

  it('does date-key arithmetic across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(dateKeyAt(Date.UTC(2026, 10, 22, 23, 30), 'Europe/Berlin')).toBe('2026-11-23');
  });

  it('formats ISO-8601 with the zone offset', () => {
    expect(toOffsetIso(Date.UTC(2026, 10, 23, 7, 40), 'Europe/Berlin')).toBe('2026-11-23T08:40:00+01:00');
    expect(toOffsetIso(Date.UTC(2026, 10, 23, 13, 40), 'America/New_York')).toBe('2026-11-23T08:40:00-05:00');
  });
});

describe('local date-time strings', () => {
  it('validates real calendar dates and times', () => {
    expect(parseLocalDateTime('2026-11-24T10:00')).toMatchObject({ day: 24, hour: 10, hasTime: true });
    expect(parseLocalDateTime('2026-11-24')).toMatchObject({ hasTime: false });
    expect(parseLocalDateTime('2026-02-30')).toBeNull();
    expect(parseLocalDateTime('2026-11-24T24:00')).toBeNull();
    expect(parseLocalDateTime('2026-11-24T10:00+01:00')).toBeNull();
    expect(parseLocalDateTime('tomorrow')).toBeNull();
  });

  it('turns date-only deadlines into the end of that local day', () => {
    expect(localDateTimeToEpoch('2026-11-27', 'Europe/Berlin', 'endOfDay')).toBe(Date.UTC(2026, 10, 27, 23, 0));
    expect(localDateTimeToEpoch('2026-11-27', 'Europe/Berlin')).toBe(Date.UTC(2026, 10, 26, 23, 0));
    expect(localDateTimeToEpoch('2026-11-27T15:00', 'Europe/Berlin', 'endOfDay')).toBe(
      Date.UTC(2026, 10, 27, 14, 0)
    );
    expect(localDateTimeToEpoch('nope', 'Europe/Berlin')).toBeNull();
  });

  it('parses Postgres time values', () => {
    expect(parseTimeOfDay('09:00')).toBe(540);
    expect(parseTimeOfDay('20:00:00')).toBe(1200);
    expect(parseTimeOfDay('24:00')).toBe(1440);
    expect(() => parseTimeOfDay('25:00')).toThrow();
  });

  it('shows "by Friday" deadlines as Friday', () => {
    const now = Date.UTC(2026, 10, 23, 7, 40);
    const saturdayMidnight = localDateTimeToEpoch('2026-11-27', 'Europe/Berlin', 'endOfDay')!;
    const label = formatDeadline(saturdayMidnight, 'Europe/Berlin', now);
    expect(label).toMatch(/27/);
  });
});
