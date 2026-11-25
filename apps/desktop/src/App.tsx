import { useEffect, useState, type ReactNode } from "react";
import { SearchDialog } from "./components/Search";
import { Lumen } from "./components/ui";
import { ambience } from "./lib/ambience";
import { useStory } from "./lib/store";
import type { ViewId } from "./types";
import { BondsView } from "./views/Bonds";
import { CalendarView } from "./views/Calendar";
import { HearthView } from "./views/Hearth";
import { HomeView } from "./views/Home";
import { LoreView } from "./views/Lore";
import { PeopleView } from "./views/People";
import { SettingsView } from "./views/Settings";
import { StorybookView } from "./views/Storybook";
import { ThreadsView } from "./views/Threads";
import { VisionView } from "./views/Vision";

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg className="nav-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const NAV: { id: ViewId; label: string; hint: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", hint: "The shelf of stories, the lamp, and how the writing has been going.", icon: <NavIcon><path d="M4 10.5 12 4l8 6.5" /><path d="M6 10v9h12v-9" /></NavIcon> },
  { id: "people", label: "People", hint: "Character sheets: who they are, and a picture if you have one.", icon: <NavIcon><circle cx="12" cy="8" r="3" /><path d="M5 19c1.2-3 3.4-4.5 7-4.5S17.8 16 19 19" /></NavIcon> },
  { id: "lore", label: "Lore", hint: "Wiki notes on shelves such as places, objects, and customs.", icon: <NavIcon><path d="M5 5h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H5z" /><path d="M19 5h-6a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h6z" /></NavIcon> },
  { id: "threads", label: "Threads", hint: "Events dated on the story calendar and tagged with people.", icon: <NavIcon><path d="M8 6h11" /><path d="M5 12h14" /><path d="M8 18h11" /><circle cx="5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="5" cy="18" r="1.2" fill="currentColor" stroke="none" /></NavIcon> },
  { id: "calendar", label: "Calendar", hint: "Named months. A day opens the thread stored there.", icon: <NavIcon><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></NavIcon> },
  { id: "hearth", label: "Hearth", hint: "Chapters and scenes, the manuscript itself.", icon: <NavIcon><path d="M12 20c4 0 6-3 6-6 0-4-3-6-4-8-1 2-3 3-3 5 0-3-2-5-4-6 0 4-3 6-3 9 0 3 2 6 8 6z" /></NavIcon> },
  { id: "storybook", label: "Storybook", hint: "Read the manuscript like a glowing book. No editing here.", icon: <NavIcon><path d="M5 5h6a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H5z" /><path d="M19 5h-6a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h6z" /><path d="M12 8v8" /></NavIcon> },
  { id: "bonds", label: "Bonds", hint: "People on a board. Drag a dot to link two of them.", icon: <NavIcon><circle cx="7" cy="12" r="2.2" /><circle cx="17" cy="8" r="2.2" /><circle cx="17" cy="16" r="2.2" /><path d="M9 11.2 14.8 8.8M9 12.8l5.8 2.4" /></NavIcon> },
  { id: "vision", label: "Vision", hint: "A canvas for notes, people, photos, and music.", icon: <NavIcon><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 15l2.5-3 2 2 2-2.5L18 15" /></NavIcon> },
  { id: "settings", label: "Settings", hint: "Themes, type, local model, the vault folder, and a JSON backup.", icon: <NavIcon><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></NavIcon> },
];

export function App() {
  const story = useStory();
  const { project } = story;
  const [railCollapsed, setRailCollapsed] = useState(() => localStorage.getItem("storymaker.rail.collapsed") === "1");

  useEffect(() => {
    localStorage.setItem("storymaker.rail.collapsed", railCollapsed ? "1" : "0");
  }, [railCollapsed]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = project.comfort.theme;
    root.dataset.motion = project.comfort.reducedMotion ? "reduce" : "ok";
    root.dataset.type = project.comfort.clearType ? "clear" : "literary";
    root.style.setProperty("--font-scale", String(project.comfort.fontScale));
    document.body.classList.toggle("warm-light", project.comfort.warmLight);
  }, [project.comfort]);

  useEffect(() => {
    void ambience.play(project.comfort.ambience, project.comfort.ambienceVolume);
  }, [project.comfort.ambience, project.comfort.ambienceVolume]);

  const view = {
    home: <HomeView />,
    people: <PeopleView />,
    lore: <LoreView />,
    threads: <ThreadsView />,
    calendar: <CalendarView />,
    hearth: <HearthView />,
    storybook: <StorybookView />,
    bonds: <BondsView />,
    vision: <VisionView />,
    settings: <SettingsView />,
  }[story.view];

  return (
    <div className={["app", story.focusMode ? "is-focus" : "", railCollapsed ? "rail-collapsed" : ""].filter(Boolean).join(" ")} data-ambience={project.comfort.ambience}>
      <div className="atmosphere" />
      <aside className="rail">
        <button
          type="button"
          className="rail-toggle"
          aria-expanded={!railCollapsed}
          aria-label={railCollapsed ? "Expand the menu" : "Collapse the menu"}
          onClick={() => setRailCollapsed((open) => !open)}
        >
          <NavIcon>
            <path d={railCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
          </NavIcon>
          <span>{railCollapsed ? "Expand" : "Collapse"}</span>
        </button>
        <button className="brand brand-btn" aria-label="StoryMaker, back to Home" onClick={() => story.setView("home")}>
          <Lumen size={42} lit={project.lampLit} />
          <div className="brand-copy">
            <strong>StoryMaker</strong>
            <span>back to Home</span>
          </div>
        </button>
        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={story.view === item.id ? "nav-btn on" : "nav-btn"}
              aria-label={`${item.label}. ${item.hint}`}
              onClick={() => story.setView(item.id)}
            >
              {item.icon}
              <span className="nav-label">{item.label}</span>
              <span className="nav-tip" role="tooltip">
                <strong>{item.label}</strong>
                {item.hint}
              </span>
            </button>
          ))}
        </nav>
        <button className="lamp" aria-label={project.lampLit ? "Lamp lit" : "Light the lamp"} onClick={project.lampLit ? story.extinguishLamp : story.lightLamp}>
          <i className={project.lampLit ? "flame on" : "flame"} />
          <span className="lamp-label">{project.lampLit ? "Lamp lit" : "Light the lamp"}</span>
        </button>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">{project.eraName} {project.year}</p>
            <h1>{project.name}</h1>
          </div>
          <button className="btn" onClick={() => story.setSearchOpen(true)}>
            Search
          </button>
        </header>
        <div className="canvas">{view}</div>
      </main>
      <SearchDialog />
      {story.summaryOpen ? (
        <div className="modal-backdrop" onClick={story.closeSummary}>
          <div className="modal card summary" onClick={(event) => event.stopPropagation()}>
            <Lumen />
            <h2>You wrote {story.sessionWords} words by lamplight.</h2>
            <p>The hearth stays warm. Come back whenever you like.</p>
            <button className="btn primary" onClick={story.closeSummary}>
              Close the evening
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
