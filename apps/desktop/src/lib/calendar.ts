import type {
  CalendarDate,
  CalendarEra,
  CalendarHoliday,
  CalendarMonth,
  CalendarPresetId,
  CalendarSettings,
  DateFormat,
  Project,
  ThreadEvent,
} from "../types";
import { uid } from "./util";

/*
 * How time works in a story. Every room formats and compares dates through here, so a change on the
 * Set up time page shows everywhere. Years are continuous timeline years: year 1 of the first era that
 * counts up is 1, the year before it is 0, and so on. Eras only change how a year reads.
 */

const mod = (a: number, n: number) => ((a % n) + n) % n;

export const GREGORIAN_MONTHS: [string, number, string][] = [
  ["January", 31, "Jan"], ["February", 28, "Feb"], ["March", 31, "Mar"], ["April", 30, "Apr"],
  ["May", 31, "May"], ["June", 30, "Jun"], ["July", 31, "Jul"], ["August", 31, "Aug"],
  ["September", 30, "Sep"], ["October", 31, "Oct"], ["November", 30, "Nov"], ["December", 31, "Dec"],
];
export const GREGORIAN_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PHASE_ICONS = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
const PHASE_NAMES = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];

export type MoonPhase = { index: number; icon: string; name: string };

export interface Reckoner {
  months: CalendarMonth[];
  settings: CalendarSettings;
  isLeap: (year: number) => boolean;
  monthDays: (year: number, monthIndex: number) => number;
  daysInYear: (year: number) => number;
  /** Days since timeline year 1, first month, day 1. */
  dayNumber: (date: CalendarDate) => number;
  /** Index into settings.weekdays, or -1 when days are not named. */
  weekday: (date: CalendarDate) => number;
  weekLength: number;
  eraFor: (year: number) => { era: CalendarEra | null; shown: number };
  toTimelineYear: (shown: number, eraId: string | undefined) => number;
  yearLabel: (year: number, withEra?: boolean) => string;
  formatDate: (date: CalendarDate, style?: DateFormat) => string;
  monthName: (monthIndex: number) => string;
  holidaysOn: (monthIndex: number, day: number) => CalendarHoliday[];
  seasonAt: (monthIndex: number, day: number) => string | null;
  moonPhase: (date: CalendarDate) => MoonPhase | null;
  /** A phase icon on the day the moon reaches a quarter (new, first quarter, full, last quarter). */
  moonMark: (date: CalendarDate) => MoonPhase | null;
  clamp: (date: CalendarDate) => CalendarDate;
  compare: (a: CalendarDate, b: CalendarDate) => number;
}

export function reckon(months: CalendarMonth[], settings: CalendarSettings): Reckoner {
  const safeMonths = months.length ? months : [{ id: "month-0", name: "Month", days: 30 }];
  const leapIndex = settings.leapMonthId ? safeMonths.findIndex((month) => month.id === settings.leapMonthId) : -1;
  const every = Math.max(2, Math.trunc(settings.leap.every) || 4);
  const base = safeMonths.reduce((sum, month) => sum + month.days, 0);
  const leapOn = leapIndex >= 0 && settings.leap.kind !== "none";

  const isLeap = (year: number) => {
    if (!leapOn) return false;
    if (settings.leap.kind === "gregorian") return mod(year, 4) === 0 && (mod(year, 100) !== 0 || mod(year, 400) === 0);
    return mod(year, every) === 0;
  };
  // Leap years in 1..n; for n < 0 this is minus the count in n+1..0, so dayNumber stays continuous.
  const leapsUpTo = (n: number) => {
    if (!leapOn) return 0;
    if (settings.leap.kind === "gregorian") return Math.floor(n / 4) - Math.floor(n / 100) + Math.floor(n / 400);
    return Math.floor(n / every);
  };
  const monthDays = (year: number, monthIndex: number) => {
    const month = safeMonths[monthIndex];
    if (!month) return 30;
    return month.days + (isLeap(year) && monthIndex === leapIndex ? 1 : 0);
  };
  const daysInYear = (year: number) => base + (isLeap(year) ? 1 : 0);
  const clamp = (date: CalendarDate): CalendarDate => {
    const monthIndex = Math.min(Math.max(0, Math.trunc(date.monthIndex) || 0), safeMonths.length - 1);
    const year = Math.trunc(date.year) || 0;
    const day = Math.min(Math.max(1, Math.trunc(date.day) || 1), monthDays(year, monthIndex));
    return { year, monthIndex, day };
  };
  const dayNumber = (input: CalendarDate) => {
    const date = clamp(input);
    let n = (date.year - 1) * base + leapsUpTo(date.year - 1);
    for (let i = 0; i < date.monthIndex; i++) n += monthDays(date.year, i);
    return n + date.day - 1;
  };
  const weekLength = settings.weekdays.length;
  const weekday = (date: CalendarDate) => (weekLength ? mod(settings.epochWeekday + dayNumber(date), weekLength) : -1);

  const ups = settings.eras.filter((era) => era.counts === "up").sort((a, b) => a.start - b.start);
  const down = settings.eras.find((era) => era.counts === "down") ?? null;
  const eraFor = (year: number) => {
    const first = ups[0];
    if (!first) return { era: down, shown: year };
    if (year < first.start && down) return { era: down, shown: first.start - year };
    let era = first;
    for (const candidate of ups) if (year >= candidate.start) era = candidate;
    return { era, shown: year - era.start + 1 };
  };
  const toTimelineYear = (shown: number, eraId: string | undefined) => {
    const era = settings.eras.find((item) => item.id === eraId) ?? ups[0];
    if (!era) return shown;
    if (era.counts === "down") return (ups[0]?.start ?? 1) - shown;
    return era.start + shown - 1;
  };
  const yearLabel = (year: number, withEra = false) => {
    const { era, shown } = eraFor(year);
    const needs = withEra || settings.showEra || era?.counts === "down";
    if (!needs || !era || !era.short) return String(shown);
    return era.place === "before" ? `${era.short} ${shown}` : `${shown} ${era.short}`;
  };
  const monthName = (monthIndex: number) => safeMonths[monthIndex]?.name ?? "";
  const formatDate = (input: CalendarDate, style: DateFormat = settings.format) => {
    const date = clamp(input);
    const name = monthName(date.monthIndex);
    if (style === "us") return `${name} ${date.day}, ${yearLabel(date.year)}`;
    if (style === "short-era") {
      const short = safeMonths[date.monthIndex]?.short || name.slice(0, 3);
      return `${date.day} ${short} ${yearLabel(date.year, true)}`;
    }
    if (style === "numeric") {
      return `${String(date.day).padStart(2, "0")}/${String(date.monthIndex + 1).padStart(2, "0")}/${eraFor(date.year).shown}`;
    }
    const index = weekday(date);
    const dayName = index >= 0 ? settings.weekdays[index] : "";
    return `${dayName ? `${dayName}, ` : ""}${date.day} ${name} ${yearLabel(date.year)}`;
  };

  const holidaysOn = (monthIndex: number, day: number) =>
    settings.holidays.filter((holiday) => holiday.monthIndex === monthIndex && holiday.day === day);
  const seasons = settings.holidays
    .filter((holiday) => holiday.kind === "season")
    .sort((a, b) => a.monthIndex - b.monthIndex || a.day - b.day);
  const seasonAt = (monthIndex: number, day: number) => {
    if (!seasons.length) return null;
    let current = seasons[seasons.length - 1];
    for (const season of seasons) if (season.monthIndex < monthIndex || (season.monthIndex === monthIndex && season.day <= day)) current = season;
    return current.name;
  };

  const moonAge = (date: CalendarDate) => {
    const ref = dayNumber(settings.moon.newMoon);
    return mod(dayNumber(date) - ref, settings.moon.cycle) / settings.moon.cycle;
  };
  const moonOn = settings.moon.on && settings.moon.cycle >= 2;
  const phaseOf = (index: number): MoonPhase => ({ index, icon: PHASE_ICONS[index], name: PHASE_NAMES[index] });
  const moonPhase = (date: CalendarDate) => (moonOn ? phaseOf(mod(Math.round(moonAge(date) * 8), 8)) : null);
  const moonMark = (date: CalendarDate) => {
    if (!moonOn) return null;
    const age = moonAge(date);
    // Mark the day the moon passes new, first quarter, full or last quarter.
    const quarter = Math.floor(age * 4) % 4;
    const before = mod(age - 1 / settings.moon.cycle, 1);
    if (quarter === Math.floor(before * 4) % 4) return null;
    return phaseOf(quarter * 2);
  };
  const compare = (a: CalendarDate, b: CalendarDate) => dayNumber(a) - dayNumber(b);

  return {
    months: safeMonths,
    settings,
    isLeap,
    monthDays,
    daysInYear,
    dayNumber,
    weekday,
    weekLength,
    eraFor,
    toTimelineYear,
    yearLabel,
    formatDate,
    monthName,
    holidaysOn,
    seasonAt,
    moonPhase,
    moonMark,
    clamp,
    compare,
  };
}

export const reckonProject = (project: Project) => reckon(project.months, project.calendar);

export const eventDate = (event: ThreadEvent): CalendarDate => ({ year: event.year, monthIndex: event.monthIndex, day: event.day });

/* ---------- presets ---------- */

export const CALENDAR_PRESETS: { id: Exclude<CalendarPresetId, "custom">; label: string; description: string }[] = [
  { id: "gregorian", label: "Gregorian", description: "January to December, 7-day week, leap years, CE and BCE. The default." },
  { id: "renamed", label: "Gregorian, your names", description: "Same lengths, weeks and leap years. Rename the months and days to suit your world." },
  { id: "thai", label: "Thai solar calendar", description: "Gregorian months and leap years with Thai names, years in the Buddhist Era (2026 CE is 2569 BE)." },
  { id: "blank", label: "Blank", description: "One month, one era, a 7-day week. Build it from the ground up." },
];

function todayDate(): CalendarDate {
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth(), day: now.getDate() };
}

const holiday = (name: string, monthIndex: number, day: number, kind: CalendarHoliday["kind"] = "holiday"): CalendarHoliday => ({
  id: uid("holiday"),
  name,
  monthIndex,
  day,
  kind,
});

function gregorian(now: CalendarDate): { months: CalendarMonth[]; calendar: CalendarSettings } {
  const months = GREGORIAN_MONTHS.map(([name, days, short]) => ({ id: uid("month"), name, days, short }));
  return {
    months,
    calendar: {
      preset: "gregorian",
      leapMonthId: months[1].id,
      leap: { kind: "gregorian", every: 4 },
      weekdays: [...GREGORIAN_WEEK],
      weekStart: 0,
      epochWeekday: 1, // 1 January, year 1 (proleptic Gregorian) was a Monday
      eras: [
        { id: uid("era"), name: "Before Common Era", short: "BCE", place: "after", start: 0, counts: "down" },
        { id: uid("era"), name: "Common Era", short: "CE", place: "after", start: 1, counts: "up" },
      ],
      showEra: false,
      now,
      holidays: [
        holiday("New Year's Day", 0, 1),
        holiday("Spring", 2, 20, "season"),
        holiday("Summer", 5, 21, "season"),
        holiday("Autumn", 8, 22, "season"),
        holiday("Winter", 11, 21, "season"),
      ],
      moon: { on: true, name: "The Moon", cycle: 29.53, newMoon: { year: 2000, monthIndex: 0, day: 6 } },
      format: "long",
    },
  };
}

export function buildPreset(id: Exclude<CalendarPresetId, "custom">, now: CalendarDate = todayDate()): { months: CalendarMonth[]; calendar: CalendarSettings } {
  const result = gregorian(now);
  const { months, calendar } = result;
  if (id === "renamed") {
    calendar.preset = "renamed";
    calendar.showEra = true;
    calendar.eras = [
      { id: uid("era"), name: "Before the Crown", short: "BC", place: "after", start: 0, counts: "down" },
      { id: uid("era"), name: "Year of the Crown", short: "YC", place: "after", start: 1, counts: "up" },
    ];
    ["Frostmonth", "Thawmonth", "Seedmonth", "Rainmonth", "Bloommonth", "Sunmonth", "Haymonth", "Harvestmonth", "Fruitmonth", "Leafmonth", "Mistmonth", "Hearthmonth"].forEach((name, i) => {
      months[i].name = name;
      months[i].short = name.slice(0, 3);
    });
  }
  if (id === "thai") {
    calendar.preset = "thai";
    calendar.showEra = true;
    const names = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const shorts = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    names.forEach((name, i) => {
      months[i].name = name;
      months[i].short = shorts[i];
    });
    calendar.weekdays = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
    calendar.eras = [
      { id: uid("era"), name: "Before the Buddhist Era", short: "ก่อน พ.ศ.", place: "before", start: 0, counts: "down" },
      { id: uid("era"), name: "Buddhist Era", short: "พ.ศ.", place: "before", start: -542, counts: "up" },
    ];
    calendar.holidays = [
      holiday("วันขึ้นปีใหม่ (New Year's Day)", 0, 1),
      holiday("วันจักรี (Chakri Day)", 3, 6),
      holiday("สงกรานต์ (Songkran)", 3, 13),
      holiday("วันแม่ (Mother's Day)", 7, 12),
      holiday("วันพ่อ (Father's Day)", 11, 5),
      holiday("วันรัฐธรรมนูญ (Constitution Day)", 11, 10),
      holiday("Hot season", 1, 15, "season"),
      holiday("Rainy season", 4, 15, "season"),
      holiday("Cool season", 9, 15, "season"),
    ];
    calendar.moon.name = "พระจันทร์ (Moon)";
  }
  if (id === "blank") {
    const first = { id: uid("month"), name: "First month", days: 30 };
    return {
      months: [first],
      calendar: {
        ...calendar,
        preset: "blank",
        leapMonthId: null,
        leap: { kind: "none", every: 4 },
        epochWeekday: 0,
        eras: [{ id: uid("era"), name: "Year", short: "Y", place: "after", start: 1, counts: "up" }],
        now: { year: 1, monthIndex: 0, day: 1 },
        holidays: [],
        moon: { on: false, name: "Moon", cycle: 28, newMoon: { year: 1, monthIndex: 0, day: 1 } },
      },
    };
  }
  return result;
}

/** A calendar for stories saved before calendars could be set up: their months, one era, no weekdays or leap years. */
export function legacyCalendar(eraName: string | undefined, year: number | undefined): CalendarSettings {
  const name = eraName?.trim() || "Year";
  const short = name
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4);
  const y = Number.isFinite(year) ? Math.trunc(year as number) : 1;
  return {
    preset: "custom",
    leapMonthId: null,
    leap: { kind: "none", every: 4 },
    weekdays: [],
    weekStart: 0,
    epochWeekday: 0,
    eras: [{ id: "era-main", name, short, place: "after", start: 1, counts: "up" }],
    showEra: false,
    now: { year: y, monthIndex: 0, day: 1 },
    holidays: [],
    moon: { on: false, name: "Moon", cycle: 28, newMoon: { year: y, monthIndex: 0, day: 1 } },
    format: "long",
  };
}

/** Fills missing or broken fields so older saves and hand-edited vaults still open. */
export function normalizeCalendar(raw: Partial<CalendarSettings> | undefined, months: CalendarMonth[], legacy: { eraName?: string; year?: number }): CalendarSettings {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.eras)) return legacyCalendar(legacy.eraName, legacy.year);
  const fallback = legacyCalendar(legacy.eraName, legacy.year);
  const weekdays = Array.isArray(raw.weekdays) ? raw.weekdays.map((day) => String(day ?? "")) : fallback.weekdays;
  const eras: CalendarEra[] = raw.eras
    .filter((era) => era && typeof era === "object")
    .map((era, index) => ({
      id: era.id || `era-${index}`,
      name: String(era.name ?? "Era"),
      short: String(era.short ?? ""),
      place: era.place === "before" ? "before" : "after",
      start: Number.isFinite(era.start) ? Math.trunc(era.start) : 1,
      counts: era.counts === "down" ? "down" : "up",
    }));
  if (!eras.some((era) => era.counts === "up")) eras.push({ ...fallback.eras[0] });
  const fixDate = (date: Partial<CalendarDate> | undefined, base: CalendarDate): CalendarDate => ({
    year: Number.isFinite(date?.year) ? Math.trunc(date!.year as number) : base.year,
    monthIndex: Number.isFinite(date?.monthIndex) ? Math.trunc(date!.monthIndex as number) : base.monthIndex,
    day: Number.isFinite(date?.day) ? Math.trunc(date!.day as number) : base.day,
  });
  const leapKind = raw.leap?.kind === "gregorian" || raw.leap?.kind === "every" ? raw.leap.kind : "none";
  const settings: CalendarSettings = {
    preset: raw.preset ?? "custom",
    leapMonthId: raw.leapMonthId && months.some((month) => month.id === raw.leapMonthId) ? raw.leapMonthId : null,
    leap: { kind: leapKind, every: Math.max(2, Math.trunc(Number(raw.leap?.every)) || 4) },
    weekdays,
    weekStart: Math.min(Math.max(0, Math.trunc(Number(raw.weekStart)) || 0), Math.max(0, weekdays.length - 1)),
    epochWeekday: Math.min(Math.max(0, Math.trunc(Number(raw.epochWeekday)) || 0), Math.max(0, weekdays.length - 1)),
    eras,
    showEra: Boolean(raw.showEra),
    now: fixDate(raw.now, fallback.now),
    holidays: (Array.isArray(raw.holidays) ? raw.holidays : []).map((item, index) => ({
      id: item.id || `holiday-${index}`,
      name: String(item.name ?? "Holiday"),
      monthIndex: Math.min(Math.max(0, Math.trunc(Number(item.monthIndex)) || 0), Math.max(0, months.length - 1)),
      day: Math.max(1, Math.trunc(Number(item.day)) || 1),
      kind: item.kind === "season" ? "season" : "holiday",
    })),
    moon: {
      on: Boolean(raw.moon?.on),
      name: String(raw.moon?.name ?? "Moon"),
      cycle: Math.max(2, Number(raw.moon?.cycle) || 29.53),
      newMoon: fixDate(raw.moon?.newMoon, fallback.now),
    },
    format: raw.format === "us" || raw.format === "short-era" || raw.format === "numeric" ? raw.format : "long",
  };
  settings.now = reckon(months, settings).clamp(settings.now);
  return settings;
}

/** Remaps month positions (in threads, holidays, "now" and the moon) after months are reordered or removed. */
export function remapMonths(project: Project, months: CalendarMonth[]): Project {
  const indexOf = new Map(months.map((month, index) => [month.id, index]));
  const remap = (oldIndex: number) => {
    const id = project.months[oldIndex]?.id;
    const next = id ? indexOf.get(id) : undefined;
    if (next !== undefined) return next;
    return Math.min(Math.max(0, oldIndex - 1), months.length - 1);
  };
  const calendar: CalendarSettings = {
    ...project.calendar,
    leapMonthId: project.calendar.leapMonthId && indexOf.has(project.calendar.leapMonthId) ? project.calendar.leapMonthId : null,
    now: { ...project.calendar.now, monthIndex: remap(project.calendar.now.monthIndex) },
    holidays: project.calendar.holidays
      .filter((item) => indexOf.has(project.months[item.monthIndex]?.id ?? ""))
      .map((item) => ({ ...item, monthIndex: remap(item.monthIndex) })),
    moon: { ...project.calendar.moon, newMoon: { ...project.calendar.moon.newMoon, monthIndex: remap(project.calendar.moon.newMoon.monthIndex) } },
  };
  const r = reckon(months, calendar);
  calendar.now = r.clamp(calendar.now);
  const events = project.events.map((event) => {
    const date = r.clamp({ year: event.year, monthIndex: remap(event.monthIndex), day: event.day });
    return { ...event, monthIndex: date.monthIndex, day: date.day };
  });
  return { ...project, months, calendar, events };
}

/** "Wednesday, 25 November 2026": the story's "now" in its own calendar. */
export function storyNowLabel(project: Project): string {
  return reckonProject(project).formatDate(project.calendar.now);
}

/** A thread's date as it reads in the story's calendar, or "no date yet". */
export function eventDateLabel(project: Project, event: ThreadEvent, style?: DateFormat): string {
  if (event.undated) return "no date yet";
  return reckonProject(project).formatDate(eventDate(event), style);
}

/** A plain-text summary of the calendar for AI prompts. */
export function describeCalendar(project: Project): string {
  const r = reckonProject(project);
  const c = project.calendar;
  const lines = [
    `Now in the story: ${r.formatDate(c.now, "long")} (${r.yearLabel(c.now.year, true)})`,
    `Months: ${project.months.map((month) => `${month.name} (${month.days} days)`).join("; ")}`,
  ];
  if (c.weekdays.length) lines.push(`Week: ${c.weekdays.join(", ")}`);
  lines.push(`Eras: ${c.eras.map((era) => `${era.name} (${era.short})`).join("; ")}`);
  const holidays = c.holidays.filter((h) => h.kind === "holiday");
  if (holidays.length) lines.push(`Holidays: ${holidays.map((h) => `${h.name} on ${h.day} ${r.monthName(h.monthIndex)}`).join("; ")}`);
  return lines.join("\n");
}

/** Two-letter day labels for small grids. A prefix every name shares ("วัน", "Day ") is dropped first. */
export function weekdayShorts(names: string[]): string[] {
  if (!names.length) return [];
  let prefix = names[0];
  for (const name of names) while (prefix && !name.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return names.map((name) => {
    const rest = name.length > prefix.length ? name.slice(prefix.length).trim() : name;
    return Array.from(rest).slice(0, 2).join("");
  });
}
