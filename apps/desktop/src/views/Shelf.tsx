import { useState } from "react";
import { useStory } from "../lib/store";

const LEATHER = ["#7a2e2a", "#1f4d3a", "#1d3e66", "#6a4324", "#4c2d55", "#8d4b2a", "#24342e", "#6e2f3c"];
const WIDTHS = [46, 54, 42, 62, 50, 58, 44, 66];
const HEIGHTS = [176, 196, 168, 188, 180, 204, 172, 192];

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
