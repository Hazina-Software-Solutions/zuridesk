import { Temporal } from "@js-temporal/polyfill";

export interface TimeRange {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface MinuteRange {
  readonly startMinute: number;
  readonly endMinute: number;
}

const byStart = (left: TimeRange, right: TimeRange) =>
  left.startsAt.getTime() - right.startsAt.getTime() ||
  left.endsAt.getTime() - right.endsAt.getTime();

export function rangesIntersect(left: TimeRange, right: TimeRange): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function intersectRanges(
  left: readonly TimeRange[],
  right: readonly TimeRange[]
): readonly TimeRange[] {
  const intersections: TimeRange[] = [];
  for (const first of left) {
    for (const second of right) {
      const startsAt = new Date(Math.max(first.startsAt.getTime(), second.startsAt.getTime()));
      const endsAt = new Date(Math.min(first.endsAt.getTime(), second.endsAt.getTime()));
      if (startsAt < endsAt) intersections.push({ startsAt, endsAt });
    }
  }
  return mergeRanges(intersections);
}

export function subtractRanges(
  available: readonly TimeRange[],
  blocked: readonly TimeRange[]
): readonly TimeRange[] {
  let result = mergeRanges(available);
  for (const blocker of mergeRanges(blocked)) {
    const next: TimeRange[] = [];
    for (const range of result) {
      if (!rangesIntersect(range, blocker)) {
        next.push(range);
        continue;
      }
      if (range.startsAt < blocker.startsAt) {
        next.push({ startsAt: range.startsAt, endsAt: blocker.startsAt });
      }
      if (blocker.endsAt < range.endsAt) {
        next.push({ startsAt: blocker.endsAt, endsAt: range.endsAt });
      }
    }
    result = next;
  }
  return result;
}

export function rangeIsContained(candidate: TimeRange, available: readonly TimeRange[]): boolean {
  return available.some(
    (range) => range.startsAt <= candidate.startsAt && candidate.endsAt <= range.endsAt
  );
}

export function utcDatesCrossed(range: TimeRange): readonly string[] {
  const dates: string[] = [];
  const cursor = new Date(
    Date.UTC(
      range.startsAt.getUTCFullYear(),
      range.startsAt.getUTCMonth(),
      range.startsAt.getUTCDate()
    )
  );
  const final = new Date(range.endsAt.getTime() - 1);
  const finalDay = Date.UTC(final.getUTCFullYear(), final.getUTCMonth(), final.getUTCDate());
  while (cursor.getTime() <= finalDay) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function localDateAt(instant: Date, timezone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(timezone)
    .toPlainDate()
    .toString();
}

export function weekdayForLocalDate(localDate: string): number {
  return Temporal.PlainDate.from(localDate).dayOfWeek % 7;
}

export function localMinuteToInstant(
  localDate: string,
  minute: number,
  timezone: string
): Date | null {
  const base = Temporal.PlainDate.from(localDate);
  const date = minute === 1_440 ? base.add({ days: 1 }) : base;
  const wallMinute = minute === 1_440 ? 0 : minute;
  const wall = date.toPlainDateTime({
    hour: Math.floor(wallMinute / 60),
    minute: wallMinute % 60
  });
  // `earlier` gives folds a stable first occurrence. A round trip distinguishes
  // a real fold from a nonexistent wall time shifted across a DST gap.
  const zoned = wall.toZonedDateTime(timezone, { disambiguation: "earlier" });
  if (!zoned.toPlainDateTime().equals(wall)) return null;
  return new Date(zoned.epochMilliseconds);
}

export function minuteRangesToUtc(
  localDate: string,
  timezone: string,
  ranges: readonly MinuteRange[]
): readonly TimeRange[] {
  const result: TimeRange[] = [];
  for (const range of ranges) {
    const startsAt = localMinuteToInstant(localDate, range.startMinute, timezone);
    const endsAt = localMinuteToInstant(localDate, range.endMinute, timezone);
    if (startsAt !== null && endsAt !== null && startsAt < endsAt) {
      result.push({ startsAt, endsAt });
    }
  }
  return mergeRanges(result);
}

export function ceilToLocalGrid(instant: Date, timezone: string, incrementMinutes: number): Date {
  const zoned = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).toZonedDateTimeISO(
    timezone
  );
  const nanosecondsOfDay =
    ((zoned.hour * 60 + zoned.minute) * 60 + zoned.second) * 1_000_000_000 +
    zoned.millisecond * 1_000_000 +
    zoned.microsecond * 1_000 +
    zoned.nanosecond;
  const incrementNanoseconds = incrementMinutes * 60 * 1_000_000_000;
  const rounded = Math.ceil(nanosecondsOfDay / incrementNanoseconds) * incrementMinutes;
  const date = zoned
    .toPlainDate()
    .add({ days: Math.floor(rounded / 1_440) })
    .toString();
  const candidate = localMinuteToInstant(date, rounded % 1_440, timezone);
  if (candidate === null) {
    return ceilToLocalGrid(
      new Date(instant.getTime() + incrementMinutes * 60_000),
      timezone,
      incrementMinutes
    );
  }
  return candidate;
}

function mergeRanges(input: readonly TimeRange[]): TimeRange[] {
  const sorted = [...input].sort(byStart);
  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous === undefined || previous.endsAt < range.startsAt) {
      merged.push({ startsAt: new Date(range.startsAt), endsAt: new Date(range.endsAt) });
    } else if (previous.endsAt < range.endsAt) {
      merged[merged.length - 1] = { startsAt: previous.startsAt, endsAt: new Date(range.endsAt) };
    }
  }
  return merged;
}
