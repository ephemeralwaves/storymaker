import { useMemo, useState, type CSSProperties } from "react";
import { CALENDAR_PRESETS, reckonProject, weekdayShorts } from "../lib/calendar";
import { useStory } from "../lib/store";
import { uid } from "../lib/util";
import type { CalendarEra, CalendarHoliday, CalendarPresetId, DateFormat } from "../types";

const mod = (a: number, n: number) => ((a % n) + n) % n;
const FORMATS: { id: DateFormat; label: string }[] = [
  { id: "long", label: "Weekday, day month year" },
  { id: "us", label: "Month day, year" },
  { id: "short-era", label: "Short, with era" },
  { id: "numeric", label: "Numbers" },
];

const int = (value: string) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : null;
};

export function CalendarSetup({ onDone }: { onDone: () => void }) {
  const story = useStory();
  const { project } = story;
  const cal = project.calendar;
  const reckoner = useMemo(() => reckonProject(project), [project]);
  const [pendingPreset, setPendingPreset] = useState<Exclude<CalendarPresetId, "custom"> | null>(null);

  const set = story.setCalendar;
  const now = cal.now;
  const nowEra = reckoner.eraFor(now.year);
  const setNow = (patch: Partial<{ day: number; monthIndex: number; shown: number; eraId: string }>) => {
    const shown = patch.shown ?? nowEra.shown;
    const eraId = patch.eraId ?? nowEra.era?.id;
    set({
      now: { year: reckoner.toTimelineYear(Math.max(1, shown), eraId), monthIndex: patch.monthIndex ?? now.monthIndex, day: patch.day ?? now.day },
      preset: cal.preset,
    });
  };
  const setEra = (index: number, patch: Partial<CalendarEra>) => {
    let eras = cal.eras.map((era, i) => (i === index ? { ...era, ...patch } : era));
    if (patch.counts === "down") eras = eras.map((era, i) => (i !== index && era.counts === "down" ? { ...era, counts: "up" } : era));
    set({ eras });
  };
  const setHoliday = (index: number, patch: Partial<CalendarHoliday>) =>
    set({ holidays: cal.holidays.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  const leapOn = cal.leapMonthId !== null && cal.leap.kind !== "none";
  const base = project.months.reduce((sum, month) => sum + month.days, 0);
  const leapMonthName = project.months.find((month) => month.id === cal.leapMonthId)?.name;
  const upCount = cal.eras.filter((era) => era.counts === "up").length;

  const cols = reckoner.weekLength || 7;
  const lead = reckoner.weekLength ? mod(reckoner.weekday({ ...now, day: 1 }) - cal.weekStart, cols) : 0;

  return (
    <div className="cal-setup">
      <div className="cal-setup-col">
        <section className="card cal-setup-intro">
          <div>
            <p className="eyebrow">Calendar</p>
            <h2>Set up time</h2>
            <p className="muted">How time works in this story. Every date in StoryMaker reads from this page.</p>
          </div>
          <button className="btn primary" onClick={onDone}>
            Back to the calendar
          </button>
        </section>

        <section className="card">
          <div className="cal-sec-head">
            <div>
              <h3>Start from</h3>
              <p className="muted">Replaces the months, week, leap years, eras and holidays. Your threads keep their dates.</p>
            </div>
          </div>
          <div className="cal-presets">
            {CALENDAR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="cal-preset"
                aria-pressed={cal.preset === preset.id}
                onClick={() => (cal.preset === preset.id ? null : setPendingPreset(preset.id))}
              >
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
              </button>
            ))}
          </div>
          {cal.preset === "custom" ? <p className="cal-note">This story uses its own calendar.</p> : null}
          {pendingPreset ? (
            <div className="cal-confirm" role="alert">
              <span>
                Replace this calendar's months, week, eras and holidays with{" "}
                <b>{CALENDAR_PRESETS.find((p) => p.id === pendingPreset)?.label}</b>? Threads keep their day, month position and year.
              </span>
              <div className="row">
                <button
                  className="btn primary"
                  onClick={() => {
                    story.applyCalendarPreset(pendingPreset);
                    setPendingPreset(null);
                  }}
                >
                  Replace
                </button>
                <button className="btn" onClick={() => setPendingPreset(null)}>
                  Keep mine
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="card">
          <div className="cal-sec-head">
            <div>
              <h3>When is "now" in the story?</h3>
              <p className="muted">The Calendar opens here. Home shows threads from this year, and the top bar, the Storybook title page and the AI use this date.</p>
            </div>
          </div>
          <div className="cal-fieldline">
            <label>
              Day
              <input
                type="number"
                min={1}
                max={reckoner.monthDays(now.year, now.monthIndex)}
                value={now.day}
                onChange={(e) => {
                  const v = int(e.target.value);
                  if (v !== null && v >= 1) setNow({ day: v });
                }}
              />
            </label>
            <label>
              Month
              <select value={now.monthIndex} onChange={(e) => setNow({ monthIndex: Number(e.target.value) })}>
                {project.months.map((month, i) => (
                  <option key={month.id} value={i}>
                    {month.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Year
              <input
                type="number"
                min={1}
                value={nowEra.shown}
                onChange={(e) => {
                  const v = int(e.target.value);
                  if (v !== null && v >= 1) setNow({ shown: v });
                }}
              />
            </label>
            {cal.eras.length > 1 ? (
              <select aria-label="Era of the story year" value={nowEra.era?.id ?? ""} onChange={(e) => setNow({ eraId: e.target.value })}>
                {cal.eras.map((era) => (
                  <option key={era.id} value={era.id}>
                    {era.short || era.name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </section>

        <section className="card">
          <div className="cal-sec-head">
            <div>
              <h3>Eras</h3>
              <p className="muted">How years are counted and named. One era can count down, like BCE, for the years before the first. Add another when something resets the count: a founding, a war, a flood.</p>
            </div>
            <button
              className="btn"
              onClick={() => {
                const last = Math.max(1, ...cal.eras.filter((era) => era.counts === "up").map((era) => era.start));
                set({ eras: [...cal.eras, { id: uid("era"), name: "New era", short: "NE", place: "after", start: Math.max(now.year + 1, last + 100), counts: "up" }] });
              }}
            >
              Add an era
            </button>
          </div>
          <div className="cal-rows">
            <div className="cal-row cal-eras-row cal-row-head" aria-hidden="true">
              <span>Name</span>
              <span>Short</span>
              <span>Short goes</span>
              <span>Year 1 is timeline year</span>
              <span>Counts</span>
              <span />
            </div>
            {cal.eras.map((era, i) => (
              <div key={era.id} className="cal-row cal-eras-row">
                <input aria-label="Era name" value={era.name} onChange={(e) => setEra(i, { name: e.target.value })} />
                <input aria-label="Short form" value={era.short} onChange={(e) => setEra(i, { short: e.target.value })} />
                <select aria-label="Short form goes" value={era.place} onChange={(e) => setEra(i, { place: e.target.value as CalendarEra["place"] })}>
                  <option value="after">after: 2026 {era.short || "CE"}</option>
                  <option value="before">before: {era.short || "CE"} 2026</option>
                </select>
                {era.counts === "down" ? (
                  <span className="muted cal-row-note">before the first era</span>
                ) : (
                  <input
                    aria-label="Timeline year where this era begins"
                    type="number"
                    value={era.start}
                    onChange={(e) => {
                      const v = int(e.target.value);
                      if (v !== null) setEra(i, { start: v });
                    }}
                  />
                )}
                <select aria-label="Counting direction" value={era.counts} onChange={(e) => setEra(i, { counts: e.target.value as CalendarEra["counts"] })}>
                  <option value="up">up from 1</option>
                  <option value="down">down to 1</option>
                </select>
                <button
                  className="cal-mini-btn"
                  aria-label={`Remove ${era.name}`}
                  disabled={era.counts === "up" && upCount <= 1}
                  onClick={() => set({ eras: cal.eras.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <label className="cal-switch">
            <input type="checkbox" checked={cal.showEra} onChange={(e) => set({ showEra: e.target.checked })} /> Show the era on dates
          </label>
        </section>

        <section className="card">
          <div className="cal-sec-head">
            <div>
              <h3>Months</h3>
              <p className="muted">Rename, reorder, add or remove months, and set their lengths. Threads move with their month.</p>
            </div>
            <button className="btn" onClick={story.addMonth}>
              Add a month
            </button>
          </div>
          <div className="cal-rows">
            <div className="cal-row cal-months-row cal-row-head" aria-hidden="true">
              <span>#</span>
              <span>Name</span>
              <span>Short</span>
              <span>Days</span>
              <span>Leap day</span>
              <span />
              <span />
              <span />
            </div>
            {project.months.map((month, i) => (
              <div key={month.id} className="cal-row cal-months-row">
                <span className="cal-row-num">{i + 1}</span>
                <input aria-label={`Month ${i + 1} name`} value={month.name} onChange={(e) => story.updateMonth(i, { name: e.target.value })} />
                <input
                  aria-label={`Short form of ${month.name}`}
                  value={month.short ?? ""}
                  placeholder={month.name.slice(0, 3)}
                  onChange={(e) => story.updateMonth(i, { short: e.target.value || undefined })}
                />
                <input
                  aria-label={`Days in ${month.name}`}
                  type="number"
                  min={1}
                  max={99}
                  value={month.days}
                  onChange={(e) => {
                    const v = int(e.target.value);
                    if (v !== null && v >= 1 && v <= 99) story.updateMonth(i, { days: v });
                  }}
                />
                <label className="cal-radio">
                  <input
                    type="radio"
                    name="leap-month"
                    checked={cal.leapMonthId === month.id}
                    onChange={() => set({ leapMonthId: month.id, leap: cal.leap.kind === "none" ? { ...cal.leap, kind: "gregorian" } : cal.leap })}
                  />
                  +1
                </label>
                <button className="cal-mini-btn" aria-label={`Move ${month.name} up`} disabled={i === 0} onClick={() => story.moveMonth(i, -1)}>
                  ↑
                </button>
                <button
                  className="cal-mini-btn"
                  aria-label={`Move ${month.name} down`}
                  disabled={i === project.months.length - 1}
                  onClick={() => story.moveMonth(i, 1)}
                >
                  ↓
                </button>
                <button className="cal-mini-btn" aria-label={`Remove ${month.name}`} disabled={project.months.length <= 1} onClick={() => story.removeMonth(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <p className="muted cal-sum">
            <b>{base}</b> days in a year
            {leapOn ? (
              <>
                , <b>{base + 1}</b> in a leap year (the extra day goes to {leapMonthName})
              </>
            ) : null}
            .
            <label className="cal-radio">
              <input type="radio" name="leap-month" checked={cal.leapMonthId === null} onChange={() => set({ leapMonthId: null })} /> No leap day
            </label>
          </p>
        </section>

        <details className="cal-more">
          <summary>
            <span>
              <strong>More options</strong>
              <span className="muted">Leap years, the week, seasons and holidays, moons</span>
            </span>
            <span className="cal-chev" aria-hidden="true">
              ▾
            </span>
          </summary>
          <div className="cal-more-body">
            <section className="card">
              <div className="cal-sec-head">
                <div>
                  <h3>Leap years</h3>
                  <p className="muted">{cal.leapMonthId ? "When the extra day appears." : "Choose a month for the leap day under Months first."}</p>
                </div>
              </div>
              <div className="cal-fieldline cal-leap">
                <label className="cal-radio">
                  <input type="radio" name="leap-rule" disabled={!cal.leapMonthId} checked={cal.leap.kind === "gregorian"} onChange={() => set({ leap: { ...cal.leap, kind: "gregorian" } })} />
                  Every 4 years, skipping centuries not divisible by 400
                </label>
                <label className="cal-radio">
                  <input type="radio" name="leap-rule" disabled={!cal.leapMonthId} checked={cal.leap.kind === "every"} onChange={() => set({ leap: { ...cal.leap, kind: "every" } })} />
                  Every
                  <input
                    type="number"
                    min={2}
                    aria-label="Years between leap years"
                    value={cal.leap.every}
                    onChange={(e) => {
                      const v = int(e.target.value);
                      if (v !== null && v >= 2) set({ leap: { ...cal.leap, every: v } });
                    }}
                  />
                  years
                </label>
                <label className="cal-radio">
                  <input type="radio" name="leap-rule" checked={cal.leap.kind === "none"} onChange={() => set({ leap: { ...cal.leap, kind: "none" } })} />
                  No leap years
                </label>
              </div>
            </section>

            <section className="card">
              <div className="cal-sec-head">
                <div>
                  <h3>Week</h3>
                  <p className="muted">The day names set how long a week is. With no names, days are just numbered.</p>
                </div>
                <div className="row">
                  <button className="btn" onClick={() => set({ weekdays: [...cal.weekdays, `Day ${cal.weekdays.length + 1}`] })}>
                    Add a day
                  </button>
                  <button className="btn" disabled={!cal.weekdays.length} onClick={() => set({ weekdays: cal.weekdays.slice(0, -1) })}>
                    Remove last
                  </button>
                </div>
              </div>
              <div className="cal-week">
                {cal.weekdays.map((name, i) => (
                  <input
                    key={i}
                    aria-label={`Day ${i + 1} of the week`}
                    value={name}
                    onChange={(e) => set({ weekdays: cal.weekdays.map((day, j) => (j === i ? e.target.value : day)) })}
                  />
                ))}
              </div>
              {cal.weekdays.length ? (
                <div className="cal-fieldline">
                  <label>
                    Weeks start on
                    <select value={cal.weekStart} onChange={(e) => set({ weekStart: Number(e.target.value) })}>
                      {cal.weekdays.map((day, i) => (
                        <option key={i} value={i}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Year 1, day 1 fell on
                    <select value={cal.epochWeekday} onChange={(e) => set({ epochWeekday: Number(e.target.value) })}>
                      {cal.weekdays.map((day, i) => (
                        <option key={i} value={i}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </section>

            <section className="card">
              <div className="cal-sec-head">
                <div>
                  <h3>Seasons and holidays</h3>
                  <p className="muted">Dates that come back every year. A season labels the stretch until the next one begins.</p>
                </div>
                <button
                  className="btn"
                  onClick={() => set({ holidays: [...cal.holidays, { id: uid("holiday"), name: "New holiday", monthIndex: now.monthIndex, day: 1, kind: "holiday" }] })}
                >
                  Add a date
                </button>
              </div>
              {cal.holidays.length ? (
                <div className="cal-rows">
                  <div className="cal-row cal-hol-row cal-row-head" aria-hidden="true">
                    <span>Name</span>
                    <span>Month</span>
                    <span>Day</span>
                    <span>Kind</span>
                    <span />
                  </div>
                  {cal.holidays.map((item, i) => (
                    <div key={item.id} className="cal-row cal-hol-row">
                      <input aria-label="Name" value={item.name} onChange={(e) => setHoliday(i, { name: e.target.value })} />
                      <select aria-label="Month" value={item.monthIndex} onChange={(e) => setHoliday(i, { monthIndex: Number(e.target.value) })}>
                        {project.months.map((month, m) => (
                          <option key={month.id} value={m}>
                            {month.name}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Day"
                        type="number"
                        min={1}
                        value={item.day}
                        onChange={(e) => {
                          const v = int(e.target.value);
                          if (v !== null && v >= 1) setHoliday(i, { day: v });
                        }}
                      />
                      <select aria-label="Kind" value={item.kind} onChange={(e) => setHoliday(i, { kind: e.target.value as CalendarHoliday["kind"] })}>
                        <option value="holiday">Holiday</option>
                        <option value="season">Season begins</option>
                      </select>
                      <button className="cal-mini-btn" aria-label={`Remove ${item.name}`} onClick={() => set({ holidays: cal.holidays.filter((_, j) => j !== i) })}>
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No recurring dates yet.</p>
              )}
            </section>

            <section className="card">
              <div className="cal-sec-head">
                <div>
                  <h3>Moons</h3>
                  <p className="muted">Optional. New, quarter and full moons show in the corner of the day.</p>
                </div>
                <label className="cal-switch">
                  <input type="checkbox" checked={cal.moon.on} onChange={(e) => set({ moon: { ...cal.moon, on: e.target.checked } })} /> Show moon phases
                </label>
              </div>
              <div className="cal-fieldline" style={{ opacity: cal.moon.on ? 1 : 0.5 }}>
                <label>
                  Name
                  <input value={cal.moon.name} onChange={(e) => set({ moon: { ...cal.moon, name: e.target.value } })} />
                </label>
                <label>
                  Cycle
                  <input
                    type="number"
                    min={2}
                    step={0.01}
                    value={cal.moon.cycle}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 2) set({ moon: { ...cal.moon, cycle: v } });
                    }}
                  />
                  days
                </label>
                <label>
                  A new moon fell on
                  <input
                    type="number"
                    min={1}
                    aria-label="Day of a known new moon"
                    value={cal.moon.newMoon.day}
                    onChange={(e) => {
                      const v = int(e.target.value);
                      if (v !== null && v >= 1) set({ moon: { ...cal.moon, newMoon: { ...cal.moon.newMoon, day: v } } });
                    }}
                  />
                  <select
                    aria-label="Month of a known new moon"
                    value={Math.min(cal.moon.newMoon.monthIndex, project.months.length - 1)}
                    onChange={(e) => set({ moon: { ...cal.moon, newMoon: { ...cal.moon.newMoon, monthIndex: Number(e.target.value) } } })}
                  >
                    {project.months.map((month, m) => (
                      <option key={month.id} value={m}>
                        {month.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    aria-label="Timeline year of a known new moon"
                    value={cal.moon.newMoon.year}
                    onChange={(e) => {
                      const v = int(e.target.value);
                      if (v !== null) set({ moon: { ...cal.moon, newMoon: { ...cal.moon.newMoon, year: v } } });
                    }}
                  />
                </label>
              </div>
            </section>
          </div>
        </details>
      </div>

      <aside className="cal-preview">
        <section className="card">
          <p className="eyebrow">Now in the story reads</p>
          <p className="cal-sample">{reckoner.formatDate(now)}</p>
          <div className="cal-formats">
            {FORMATS.map((format) => (
              <label key={format.id}>
                <input type="radio" name="date-format" checked={cal.format === format.id} onChange={() => set({ format: format.id, preset: cal.preset })} />
                <span>
                  <b>{reckoner.formatDate(now, format.id)}</b>
                  <small>{format.label}</small>
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="card">
          <p className="eyebrow">Preview</p>
          <div className="cal-mini static">
            <span className="cal-mini-head">
              <strong>
                {project.months[now.monthIndex]?.name} {reckoner.yearLabel(now.year)}
              </strong>
              <span>{reckoner.isLeap(now.year) ? "leap year" : ""}</span>
            </span>
            <span className="cal-mini-grid" style={{ "--cols": cols } as CSSProperties}>
              {weekdayShorts(Array.from({ length: reckoner.weekLength }, (_, i) => cal.weekdays[mod(cal.weekStart + i, cols)] ?? "")).map((name, i) => (
                <i key={`w${i}`}>{name}</i>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`l${i}`} />
              ))}
              {Array.from({ length: reckoner.monthDays(now.year, now.monthIndex) }, (_, i) => (
                <span key={i} className={i + 1 === now.day ? "now" : reckoner.holidaysOn(now.monthIndex, i + 1).length ? "hol" : ""}>
                  {i + 1}
                </span>
              ))}
            </span>
          </div>
        </section>
        <section className="card cal-stats">
          <div>
            <b>{base}</b>
            <span>days in a year</span>
          </div>
          <div>
            <b>{leapOn ? base + 1 : "—"}</b>
            <span>in a leap year</span>
          </div>
          <div>
            <b>{project.months.length}</b>
            <span>months</span>
          </div>
          <div>
            <b>{reckoner.weekLength || "—"}</b>
            <span>days in a week</span>
          </div>
        </section>
      </aside>
    </div>
  );
}
