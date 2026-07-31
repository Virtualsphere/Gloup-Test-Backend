#!/usr/bin/env node
/**
 * Unit tests for store holiday helpers (no DB).
 * Run: node --test scripts/test-store-holidays.mjs
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWeekday,
  assertWeekday,
  toDateOnly,
  assertDateOnly,
  assertDateRange,
  normalizeReason,
  expandWeeklyDates,
  mergeClosedDates,
  findClosureReason,
  weekdayOfDateOnly,
  WEEKDAY_NAMES,
} from "../src/core/utils/storeHolidays.js";

describe("normalizeWeekday", () => {
  it("accepts 0-6 and names", () => {
    assert.equal(normalizeWeekday(0), 0);
    assert.equal(normalizeWeekday("6"), 6);
    assert.equal(normalizeWeekday("Sunday"), 0);
    assert.equal(normalizeWeekday("saturday"), 6);
    assert.equal(normalizeWeekday("foo"), null);
  });
});

describe("assertWeekday", () => {
  it("throws on invalid", () => {
    assert.throws(() => assertWeekday("nope"), /weekday/);
  });
});

describe("assertDateRange", () => {
  it("accepts valid ranges", () => {
    const r = assertDateRange("2026-08-01", "2026-08-10");
    assert.equal(r.days, 10);
  });

  it("rejects inverted range", () => {
    assert.throws(
      () => assertDateRange("2026-08-10", "2026-08-01"),
      /from must be/
    );
  });

  it("rejects oversized range", () => {
    assert.throws(
      () => assertDateRange("2026-01-01", "2028-01-01", { maxDays: 400 }),
      /cannot exceed/
    );
  });
});

describe("normalizeReason", () => {
  it("trims and nulls empty", () => {
    assert.equal(normalizeReason("  "), null);
    assert.equal(normalizeReason(" Festival "), "Festival");
  });

  it("caps length", () => {
    const long = "x".repeat(600);
    assert.equal(normalizeReason(long, { maxLength: 500 }).length, 500);
  });
});

describe("expandWeeklyDates", () => {
  it("expands Sundays in a week", () => {
    // 2026-08-02 is Sunday, 2026-08-09 is Sunday
    const dates = expandWeeklyDates([{ weekday: 0 }], "2026-08-01", "2026-08-10");
    assert.deepEqual(dates, ["2026-08-02", "2026-08-09"]);
  });

  it("expands Saturdays", () => {
    const dates = expandWeeklyDates([6], "2026-08-01", "2026-08-08");
    assert.deepEqual(dates, ["2026-08-01", "2026-08-08"]);
  });

  it("expands Sunday+Saturday together", () => {
    const dates = expandWeeklyDates(
      [{ weekday: 0 }, { weekday: 6 }],
      "2026-08-01",
      "2026-08-09"
    );
    assert.deepEqual(dates, [
      "2026-08-01",
      "2026-08-02",
      "2026-08-08",
      "2026-08-09",
    ]);
  });
});

describe("mergeClosedDates", () => {
  it("merges one-off and weekly", () => {
    const dates = mergeClosedDates(
      [{ holiday_date: "2026-08-05" }],
      [{ weekday: 0 }],
      "2026-08-01",
      "2026-08-10"
    );
    assert.ok(dates.includes("2026-08-05"));
    assert.ok(dates.includes("2026-08-02"));
    assert.ok(dates.includes("2026-08-09"));
  });
});

describe("findClosureReason", () => {
  it("prefers one-off over weekly", () => {
    const info = findClosureReason(
      { reason: "Festival" },
      [{ weekday: weekdayOfDateOnly("2026-08-02"), reason: "Weekly" }],
      "2026-08-02"
    );
    assert.equal(info.type, "one_off");
    assert.equal(info.reason, "Festival");
  });

  it("detects weekly Sunday", () => {
    const info = findClosureReason(
      null,
      [{ weekday: 0, reason: "Weekly off" }],
      "2026-08-02"
    );
    assert.equal(info.type, "weekly");
    assert.equal(info.weekday_name, "Sunday");
  });

  it("returns null when open", () => {
    assert.equal(
      findClosureReason(null, [{ weekday: 0 }], "2026-08-03"),
      null
    );
  });
});

describe("WEEKDAY_NAMES", () => {
  it("has 7 days starting Sunday", () => {
    assert.equal(WEEKDAY_NAMES.length, 7);
    assert.equal(WEEKDAY_NAMES[0], "Sunday");
    assert.equal(WEEKDAY_NAMES[6], "Saturday");
  });
});

describe("toDateOnly / assertDateOnly", () => {
  it("normalizes values", () => {
    assert.equal(toDateOnly("2026-08-02T10:00:00.000Z")?.slice(0, 10), "2026-08-02");
    assert.equal(toDateOnly("bad"), null);
    assert.throws(() => assertDateOnly("bad"), /YYYY-MM-DD/);
  });
});

console.log("storeHolidays helper tests loaded");
