import { useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { eventDate, reckonProject, weekdayShorts, type Reckoner } from "../lib/calendar";
import { useStory } from "../lib/store";
import type { CalendarDate, ThreadEvent } from "../types";
import { CalendarSetup } from "./CalendarSetup";

const THREAD_COLORS = ["var(--accent)", "#5d7fb8", "#4f9a6b", "#a8455f", "#8a6ab8", "#c9923d"];
const mod = (a: number, n: number) => ((a % n) + n) % n;
const sameDay = (a: CalendarDate, b: CalendarDate) => a.year === b.year && a.monthIndex === b.monthIndex && a.day === b.day;

function YearText({ reckoner, year }: { reckoner: Reckoner; year: number }) {
  const { era, shown } = reckoner.eraFor(year);
  if (!era?.short) return <>{shown}</>;
  return era.place === "before" ? (
    <>
      <small className="cal-era-short before">{era.short}</small>
      {shown}
    </>
  ) : (
    <>
      {shown} <small className="cal-era-short">{era.short}</small>
    </>
  );
}

export function CalendarView() {
  const story = useStory();
  const { project } = story;
  const reckoner = useMemo(() => reckonProject(project), [project]);
  const now = project.calendar.now;

  const [tab, setTab] = useState<"calendar" | "setup">("calendar");
  const [mode, setMode] = useState<"month" | "year">("month");
  const [view, setView] = useState({ year: now.year, monthIndex: now.monthIndex });
  const [selected, setSelected] = useState<CalendarDate>(now);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const monthIndex = Math.min(view.monthIndex, project.months.length - 1);
  const sel = reckoner.clamp(selected);
  const colorOf = (event: ThreadEvent, index: number) => {
    const lead = project.characters.findIndex((c) => c.id === event.characterIds[0]);
    return THREAD_COLORS[(lead >= 0 ? lead : index) % THREAD_COLORS.length];
  };
  const dated = project.events.filter((event) => !event.undated);
  const undated = project.events.filter((event) => event.undated);
  const eventsOn = (date: CalendarDate) => dated.filter((event) => sameDay(eventDate(event), date));

  const step = (dir: -1 | 1) => {
    if (mode === "year") return setView((v) => ({ ...v, year: v.year + dir }));
    setView((v) => {
      let m = Math.min(v.monthIndex, project.months.length - 1) + dir;
      let y = v.year;
      if (m < 0) {
        m = project.months.length - 1;
        y -= 1;
      }
      if (m >= project.months.length) {
        m = 0;
        y += 1;
      }
      return { year: y, monthIndex: m };
    });
  };
  const goNow = () => {
    setView({ year: now.year, monthIndex: now.monthIndex });
    setSelected(now);
  };

  const schedule = (id: string, date: CalendarDate | null) => {
    const event = project.events.find((item) => item.id === id);
    if (!event) return;
    if (!date) story.saveEvent({ ...event, undated: true });
    else {
      const { undated: _wasUndated, ...rest } = event;
      story.saveEvent({ ...rest, year: date.year, monthIndex: date.monthIndex, day: date.day });
      setSelected(date);
    }
  };
  const dragProps = (event: ThreadEvent) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData("text/plain", event.id);
      e.dataTransfer.effectAllowed = "move";
      setDragId(event.id);
    },
    onDragEnd: () => {
      setDragId(null);
      setDropKey(null);
    },
  });
  const dropProps = (key: string, date: CalendarDate | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      setDropKey(key);
    },
    onDragLeave: () => setDropKey((k) => (k === key ? null : k)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || dragId;
      if (id) schedule(id, date);
      setDragId(null);
      setDropKey(null);
    },
  });

  const { era } = reckoner.eraFor(view.year);
  const yearJump = reckoner.eraFor(view.year);

  if (tab === "setup") return <CalendarSetup onDone={() => setTab("calendar")} />;

  const cols = reckoner.weekLength || 7;
  const weekdayOrder = reckoner.weekLength
    ? Array.from({ length: cols }, (_, i) => project.calendar.weekdays[mod(project.calendar.weekStart + i, cols)])
    : [];

  const renderMonth = () => {
    const y = view.year;
    const m = monthIndex;
    const first = { year: y, monthIndex: m, day: 1 };
    const lead = reckoner.weekLength ? mod(reckoner.weekday(first) - project.calendar.weekStart, cols) : 0;
    const prev = m === 0 ? { year: y - 1, monthIndex: project.months.length - 1 } : { year: y, monthIndex: m - 1 };
    const prevDays = reckoner.monthDays(prev.year, prev.monthIndex);
    const days = reckoner.monthDays(y, m);
    const trail = mod(cols - mod(lead + days, cols), cols);
    return (
      <div className="cal-grid-wrap">
        <div className="cal-grid" style={{ "--cols": cols } as CSSProperties}>
          {weekdayOrder.map((name, i) => (
            <div key={`wd-${i}`} className="cal-wd" title={name}>
              {name}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`lead-${i}`} className="cal-cell spill" aria-hidden="true">
              <span className="cal-n">{prevDays - lead + i + 1}</span>
            </div>
          ))}
          {Array.from({ length: days }, (_, i) => {
            const date = { year: y, monthIndex: m, day: i + 1 };
            const key = `${y}-${m}-${i + 1}`;
            const holidays = reckoner.holidaysOn(m, i + 1);
            const moon = reckoner.moonMark(date);
            const events = eventsOn(date);
            const isNow = sameDay(date, now);
            return (
              <div
                key={key}
                className={["cal-cell", isNow ? "now" : "", sameDay(date, sel) ? "sel" : "", dropKey === key ? "drop" : ""].filter(Boolean).join(" ")}
                role="button"
                tabIndex={0}
                aria-label={reckoner.formatDate(date)}
                onClick={() => setSelected(date)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(date);
                  }
                }}
                {...dropProps(key, date)}
              >
                <span className="cal-n">
                  <b>{i + 1}</b>
                  {moon ? (
                    <span className="cal-moon" title={`${project.calendar.moon.name}: ${moon.name.toLowerCase()}`}>
                      {moon.icon}
                    </span>
                  ) : null}
                </span>
                {holidays.map((h) => (
                  <span key={h.id} className={h.kind === "season" ? "cal-season" : "cal-holiday"}>
                    {h.kind === "season" ? "◆ " : ""}
                    {h.name}
                  </span>
                ))}
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    className="cal-chip"
                    style={{ "--c": colorOf(event, project.events.indexOf(event)) } as CSSProperties}
                    onClick={(e) => {
                      e.stopPropagation();
                      story.openEvent(event.id);
                    }}
                    {...dragProps(event)}
                  >
                    {event.title || "Untitled thread"}
                  </button>
                ))}
                {isNow ? <span className="cal-now-tag">Now</span> : null}
              </div>
            );
          })}
          {Array.from({ length: trail }, (_, i) => (
            <div key={`trail-${i}`} className="cal-cell spill" aria-hidden="true">
              <span className="cal-n">{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderYear = () => (
    <div className="cal-year">
      {project.months.map((month, m) => {
        const lead = reckoner.weekLength ? mod(reckoner.weekday({ year: view.year, monthIndex: m, day: 1 }) - project.calendar.weekStart, cols) : 0;
        const days = reckoner.monthDays(view.year, m);
        const count = dated.filter((e) => e.year === view.year && e.monthIndex === m).length;
        return (
          <button
            key={month.id}
            type="button"
            className="cal-mini"
            onClick={() => {
              setView({ year: view.year, monthIndex: m });
              setMode("month");
            }}
          >
            <span className="cal-mini-head">
              <strong>{month.name}</strong>
              <span>{count ? `${count} ${count === 1 ? "thread" : "threads"}` : ""}</span>
            </span>
            <span className="cal-mini-grid" style={{ "--cols": cols } as CSSProperties}>
              {weekdayShorts(weekdayOrder).map((name, i) => (
                <i key={`w${i}`}>{name}</i>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`l${i}`} />
              ))}
              {Array.from({ length: days }, (_, i) => {
                const date = { year: view.year, monthIndex: m, day: i + 1 };
                const cls = sameDay(date, now)
                  ? "now"
                  : eventsOn(date).length
                    ? "ev"
                    : reckoner.holidaysOn(m, i + 1).some((h) => h.kind === "holiday")
                      ? "hol"
                      : "";
                return (
                  <span key={i} className={cls}>
                    {i + 1}
                  </span>
                );
              })}
            </span>
          </button>
        );
      })}
    </div>
  );

  const selEvents = eventsOn(sel);
  const selHolidays = reckoner.holidaysOn(sel.monthIndex, sel.day).filter((h) => h.kind === "holiday");
  const season = reckoner.seasonAt(sel.monthIndex, sel.day);
  const phase = reckoner.moonPhase(sel);
  const subLine =
    mode === "month"
      ? [`${reckoner.monthDays(view.year, monthIndex)} days`, reckoner.seasonAt(monthIndex, 1), reckoner.isLeap(view.year) ? "leap year" : null]
      : [`${reckoner.daysInYear(view.year)} days`, reckoner.isLeap(view.year) ? "leap year" : null];

  return (
    <div className="stack cal-room">
      <section className="card cal-head">
        <div className="cal-title">
          <p className="eyebrow">{era?.name ?? "Calendar"}</p>
          <h2>
            {mode === "month" ? `${project.months[monthIndex]?.name ?? ""} ` : null}
            <YearText reckoner={reckoner} year={view.year} />
          </h2>
          <p className="muted cal-sub">{subLine.filter(Boolean).join(" · ")}</p>
        </div>
        <div className="row wrap">
          <button className="btn cal-icon" onClick={() => step(-1)} aria-label={mode === "month" ? "Previous month" : "Previous year"}>
            ‹
          </button>
          <button className="btn" onClick={goNow}>
            Now in the story
          </button>
          <button className="btn cal-icon" onClick={() => step(1)} aria-label={mode === "month" ? "Next month" : "Next year"}>
            ›
          </button>
        </div>
        <div className="row wrap">
          {mode === "month" ? (
            <select aria-label="Month" value={monthIndex} onChange={(e) => setView((v) => ({ ...v, monthIndex: Number(e.target.value) }))}>
              {project.months.map((month, i) => (
                <option key={month.id} value={i}>
                  {month.name}
                </option>
              ))}
            </select>
          ) : null}
          <input
            className="cal-year-input"
            type="number"
            min={1}
            aria-label="Year"
            value={yearJump.shown}
            onChange={(e) => {
              const shown = Number(e.target.value);
              if (Number.isFinite(shown) && shown >= 1) setView((v) => ({ ...v, year: reckoner.toTimelineYear(shown, yearJump.era?.id) }));
            }}
          />
          {project.calendar.eras.length > 1 ? (
            <select aria-label="Era" value={yearJump.era?.id ?? ""} onChange={(e) => setView((v) => ({ ...v, year: reckoner.toTimelineYear(yearJump.shown, e.target.value) }))}>
              {project.calendar.eras.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.short || item.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <div className="cal-seg" role="group" aria-label="View">
          <button aria-pressed={mode === "month"} onClick={() => setMode("month")}>
            Month
          </button>
          <button aria-pressed={mode === "year"} onClick={() => setMode("year")}>
            Year
          </button>
        </div>
        <button className="btn" onClick={() => setTab("setup")}>
          ⚙ Set up time
        </button>
      </section>

      <div className="cal-body">
        <section className="card cal-main">{mode === "month" ? renderMonth() : renderYear()}</section>
        <aside className="cal-side">
          <section className="card cal-detail">
            <p className="eyebrow">{sameDay(sel, now) ? "Now in the story" : "Selected day"}</p>
            <h3>{reckoner.formatDate(sel)}</h3>
            <p className="muted cal-meta">
              {[season, ...selHolidays.map((h) => h.name), phase ? `${project.calendar.moon.name}: ${phase.name.toLowerCase()}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {selEvents.length ? (
              <ul className="cal-day-list">
                {selEvents.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="cal-chip"
                      style={{ "--c": colorOf(event, project.events.indexOf(event)) } as CSSProperties}
                      onClick={() => story.openEvent(event.id)}
                      {...dragProps(event)}
                    >
                      {event.title || "Untitled thread"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted cal-meta">No threads on this day.</p>
            )}
            <div className="row wrap">
              <button
                className="btn primary"
                onClick={() => story.addEvent({ title: "New thread", year: sel.year, monthIndex: sel.monthIndex, day: sel.day })}
              >
                Add a thread here
              </button>
              {!sameDay(sel, now) ? (
                <button className="btn" onClick={() => story.setCalendar({ now: sel, preset: project.calendar.preset })}>
                  Make this "now"
                </button>
              ) : null}
            </div>
          </section>

          <section className={dropKey === "inbox" ? "card cal-inbox drop" : "card cal-inbox"} {...dropProps("inbox", null)}>
            <h3>Not on the calendar yet</h3>
            <p className="muted cal-meta">Threads without a date wait here. Drag one onto a day, or place it on the selected day. Drag a dated thread here to take its date away.</p>
            {undated.length ? (
              <ul className="cal-day-list">
                {undated.map((event) => (
                  <li key={event.id} className="cal-inbox-item">
                    <button
                      type="button"
                      className="cal-chip"
                      style={{ "--c": colorOf(event, project.events.indexOf(event)) } as CSSProperties}
                      onClick={() => story.openEvent(event.id)}
                      {...dragProps(event)}
                    >
                      {event.title || "Untitled thread"}
                    </button>
                    <button type="button" className="text-btn" onClick={() => schedule(event.id, sel)}>
                      Place on {reckoner.formatDate(sel, "short-era")}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted cal-meta">Every thread has a date.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
