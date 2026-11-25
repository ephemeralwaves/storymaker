import { useState } from "react";
import { useStory } from "../lib/store";

import { HEIGHTS, LEATHER, WIDTHS } from "../lib/leather";

function spineFont(title: string, width: number, height: number): number {
  const availableH = Math.max(48, height - 40);
  const availableW = Math.max(18, width - 12);
  let size = 16;
  while (size > 9) {
    const rows = Math.floor(availableH / (size * 1.05));
    const cols = Math.max(1, Math.floor(availableW / (size * 0.85)));
    if (rows * cols >= title.length) break;
    size -= 0.5;
  }
  return size;
}

function ShelfLantern() {
  return (
    <svg className="shelf-lantern" viewBox="0 0 46 74" aria-hidden="true">
      <path d="M23 4v6M15 10h16l-2 6H17z" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="16" width="20" height="34" rx="4" fill="rgba(230,189,106,.18)" stroke="currentColor" strokeWidth="2" />
      <path d="M23 26c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z" fill="#fbe6a8" />
      <path d="M10 50h26l-3 8H13z" fill="currentColor" />
      <path d="M6 70h34" stroke="currentColor" strokeWidth="3" />
      <path d="M17 58v12M29 58v12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function ShelfView() {
  const story = useStory();
  const [draft, setDraft] = useState("");
  const [naming, setNaming] = useState(false);
  const rows: (typeof story.books)[] = [];
  for (let index = 0; index < story.books.length; index += 8) rows.push(story.books.slice(index, index + 8));
  if (rows.length === 0) rows.push([]);

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    story.addBook(title);
    setDraft("");
    setNaming(false);
  };

  return (
    <section className="home-shelf" aria-label="The shelf">
      <div className="bookcase">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="shelf-plank">
            {rowIndex === 0 ? <ShelfLantern /> : null}
            {row.map((book) => (
              <div
                key={book.id}
                className={book.id === story.bookId ? "book on" : "book"}
                style={{
                  background: LEATHER[book.spine % LEATHER.length],
                  width: WIDTHS[book.spine % WIDTHS.length],
                  height: HEIGHTS[book.spine % HEIGHTS.length],
                }}
              >
                <button type="button" className="book-open" onClick={() => story.openBook(book.id)}>
                  <i />
                  <strong style={{ fontSize: spineFont(book.title, WIDTHS[book.spine % WIDTHS.length], HEIGHTS[book.spine % HEIGHTS.length]) }}>
                    {book.title}
                  </strong>
                </button>
                <button
                  type="button"
                  className="book-x"
                  aria-label={`Take ${book.title} off the shelf`}
                  onClick={() => story.removeBook(book.id)}
                >
                  ×
                </button>
              </div>
            ))}
            {rowIndex === rows.length - 1 ? (
              naming ? (
                <form
                  className="book-draft"
                  onSubmit={(event) => {
                    event.preventDefault();
                    add();
                  }}
                >
                  <input
                    autoFocus
                    value={draft}
                    placeholder="Title"
                    aria-label="Title of the new story"
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button className="btn primary" type="submit">
                    Set it on the shelf
                  </button>
                </form>
              ) : (
                <button className="book book-new" type="button" onClick={() => setNaming(true)}>
                  <strong>New story</strong>
                </button>
              )
            ) : null}
          </div>
        ))}
      </div>
      <p className="shelf-note">
        Each book is its own story. These stay inside StoryMaker on this computer until you link a vault folder from Settings.
      </p>
    </section>
  );
}
