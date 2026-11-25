import { useState } from "react";
import { useStory } from "../lib/store";

export function CalendarView() {
  const story = useStory();
  const [monthIndex, setMonthIndex] = useState(1);
  const safeIndex = Math.min(monthIndex, Math.max(0, story.project.months.length - 1));
  const month = story.project.months[safeIndex];
  const days = Array.from({ length: month?.days ?? 28 }, (_, index) => index + 1);

  const openDay = (day: number) => {
    const events = story.project.events.filter((event) => event.monthIndex === safeIndex && event.day === day);
    if (events[0]) {
      story.openEvent(events[0].id);
      return;
    }
    story.addEvent({
      title: `${month?.name ?? "Day"} ${day}`,
      monthIndex: safeIndex,
      day,
      year: story.project.year,
    });
  };

  return (
    <div className="stack">
      <section className="card calendar-head">
        <div>
          <p className="eyebrow">{story.project.eraName}</p>
          <h2>
            {month?.name} · Year {story.project.year}
          </h2>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setMonthIndex((n) => (n + story.project.months.length - 1) % story.project.months.length)}>
            Previous
          </button>
          <button className="btn" onClick={() => setMonthIndex((n) => (n + 1) % story.project.months.length)}>
            Next
          </button>
        </div>
      </section>
      <section className="month-grid">
        {days.map((day) => {
          const events = story.project.events.filter((event) => event.monthIndex === safeIndex && event.day === day);
          return (
            <div key={day} className={events.length ? "day has" : "day"}>
              <button className="day-open" onClick={() => openDay(day)}>
                <strong>{day}</strong>
              </button>
              {events.map((event) => (
                <button key={event.id} className="day-event" onClick={() => story.openEvent(event.id)}>
                  {event.title}
                </button>
              ))}
            </div>
          );
        })}
      </section>
      <section className="card stack">
        <div className="row spread">
          <h3>Months in this year</h3>
          <button className="btn" onClick={story.addMonth}>
            Add a month
          </button>
        </div>
        <div className="form-grid">
          {story.project.months.map((item, index) => (
            <div key={item.id} className="field month-edit">
              <span>Month {index + 1}</span>
              <input
                value={item.name}
                aria-label={`Name of month ${index + 1}`}
                onChange={(event) => story.updateMonth(index, { name: event.target.value })}
              />
              <label>
                Days
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={item.days}
                  onChange={(event) => story.updateMonth(index, { days: Math.max(1, Number(event.target.value) || 1) })}
                />
              </label>
              <button className="text-btn" onClick={() => story.removeMonth(index)} disabled={story.project.months.length <= 1}>
                Remove month
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
