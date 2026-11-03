import { describe, expect, it } from "vitest";

import {
  ceilToLocalGrid,
  intersectRanges,
  localMinuteToInstant,
  minuteRangesToUtc,
  rangeIsContained,
  rangesIntersect,
  subtractRanges,
  utcDatesCrossed
} from "./phase4-availability";

const range = (start: string, end: string) => ({
  startsAt: new Date(start),
  endsAt: new Date(end)
});

describe("Phase 4.2 availability primitives", () => {
  it("uses half-open intersection and preserves touching adjacency", () => {
    const morning = range("2026-11-04T06:00:00Z", "2026-11-04T07:00:00Z");
    const next = range("2026-11-04T07:00:00Z", "2026-11-04T08:00:00Z");
    expect(rangesIntersect(morning, next)).toBe(false);
    expect(rangeIsContained(morning, [morning])).toBe(true);
  });

  it("intersects split shifts and subtracts exact blockers", () => {
    const open = [
      range("2026-11-04T06:00:00Z", "2026-11-04T10:00:00Z"),
      range("2026-11-04T11:00:00Z", "2026-11-04T15:00:00Z")
    ];
    const staff = [range("2026-11-04T07:00:00Z", "2026-11-04T13:00:00Z")];
    const intersection = intersectRanges(open, staff);
    expect(intersection).toEqual([
      range("2026-11-04T07:00:00Z", "2026-11-04T10:00:00Z"),
      range("2026-11-04T11:00:00Z", "2026-11-04T13:00:00Z")
    ]);
    expect(
      subtractRanges(intersection, [range("2026-11-04T08:00:00Z", "2026-11-04T09:00:00Z")])
    ).toEqual([
      range("2026-11-04T07:00:00Z", "2026-11-04T08:00:00Z"),
      range("2026-11-04T09:00:00Z", "2026-11-04T10:00:00Z"),
      range("2026-11-04T11:00:00Z", "2026-11-04T13:00:00Z")
    ]);
  });

  it("converts Nairobi wall time and rejects a DST gap while choosing the earlier fold", () => {
    expect(localMinuteToInstant("2026-11-04", 540, "Africa/Nairobi")?.toISOString()).toBe(
      "2026-11-04T06:00:00.000Z"
    );
    expect(localMinuteToInstant("2026-03-08", 150, "America/New_York")).toBeNull();
    expect(localMinuteToInstant("2026-11-01", 90, "America/New_York")?.toISOString()).toBe(
      "2026-11-01T05:30:00.000Z"
    );
  });

  it("rounds a non-zero-second instant forward to the next local grid boundary", () => {
    expect(
      ceilToLocalGrid(new Date("2026-11-10T06:15:30.000Z"), "Africa/Nairobi", 15).toISOString()
    ).toBe("2026-11-10T06:30:00.000Z");
  });

  it("handles closed dates and every UTC day crossed by a buffered range", () => {
    expect(minuteRangesToUtc("2026-11-04", "Africa/Nairobi", [])).toEqual([]);
    expect(utcDatesCrossed(range("2026-11-04T23:45:00Z", "2026-11-05T00:15:00Z"))).toEqual([
      "2026-11-04",
      "2026-11-05"
    ]);
  });
});
