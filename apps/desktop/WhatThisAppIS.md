# What StoryMaker is

StoryMaker is an offline writing room for novelists and game masters. One story holds people, lore, a custom calendar, plot threads, a manuscript, a mood board, a relationship board, and a vision canvas. Nothing is uploaded. A local model is optional and never edits the manuscript on its own.

The feeling is a warm desk: paper, lamp light, and a small lantern named Lumen. Themes, the sample story Lantern and Tide, and the room tones are original. Fonts are Fraunces, Nunito, and Atkinson Hyperlegible.

The app opens on Home. A shelf of books sits at the top of that page. Each book is a separate story: leather spines on a wood case, one project per book.

`docs/SPEC.md` and the root `README.md` describe an earlier single-project version. Trust this file and `apps/desktop/src` when they disagree.

## How to run it

```bash
cd apps/desktop
npm install
npm run dev
```

Open http://127.0.0.1:1420 (Vite is pinned to port 1420).

Desktop shell, after Rust is installed:

```bash
cd apps/desktop
npm run tauri dev
```

Stack: React 19, TypeScript, Vite 7, Tauri 2. The frontend is `apps/desktop/src`. The Rust shell is `apps/desktop/src-tauri`. It mirrors the open story to disk, and on Windows it also opens, reads, and writes the linked Obsidian folder. Check types with `npx tsc --noEmit` from `apps/desktop`. Restart `npm run tauri dev` after a Rust change so those folder commands are in the running app.

## Rooms

The rail is the room list. Each room has an icon, and hovering it says what that room is. Collapse hides the names and leaves the icons. The StoryMaker mark returns to Home, where the shelf sits.

- **Shelf.** At the top of Home. Click a spine to open that story. **New story** starts a blank book (starter calendar and lore shelves, no sample cast). Hover a spine and use × to remove that book from this computer. The open book has a gold outline. Sample story is Lantern and Tide.
- **Home.** The shelf, then the lamp ritual, counts, a 14-day word chart, who the pages mention, room tone. Lumen on this page and the Lumen in the rail are warm gold while the lamp is lit and grey while it is out.
- **People.** Character sheet: role, age, origin, gift, status, personality, summary, backstory, habits, fears, and a picture.
- **Lore.** Wiki notes on shelves (Places, Ecology, Objects, Houses, Customs by default). Summary, body, picture, and backlinks when another note names the title.
- **Threads.** Events dated on the story calendar and tagged with people.
- **Calendar.** Named months with their own lengths. A day opens the thread stored there, or starts one.
- **Hearth.** Chapters and scenes. Status, word goal, focus mode, and the people and lore pinned to the scene. The manuscript fills the page. Font and size on that page are Fraunces, Nunito, or Atkinson, and the size can go smaller than the rest of the app.
- **Mood.** Colors, notes, and pictures. Pictures are shrunk in the browser before they are saved.
- **Bonds.** People as cards on a pan-and-zoom board. Drag the dot on a card to link two people. Bond types can be renamed, added, and removed.
- **Vision.** A canvas. Pin a note, person, lore page, thread, or scene. Import a photo or a music file (up to 25 MB). Drag cards, draw links, scroll to zoom. A drag stays on the card you grabbed, including when the pointer crosses another card, and the new position is saved when you let go. Open jumps to the linked page. A person or lore picture shows on the card when that page is pinned.
- **AI Studio.** Optional. Streams a suggestion from Ollama at `http://127.0.0.1:11434`, or lists tools on an HTTP MCP server. The user starts every request. Inserting text into a scene is a separate action.
- **Settings.** Themes, type size, warm light, clear type, reduced motion, room-tone volume. The dark themes are Candlelit Study, Royal Plum, Ember Room, Pine Cabin, Wool Dusk, and Rain Lamp. Obsidian vault. JSON backup. Restore the sample story into the open book.

Search covers the open story only.

## Saves

The shelf and the stories live in the browser profile that is running the app. The Vite preview (`http://127.0.0.1:1420`) and the Tauri webview do not share a shelf.

- `localStorage` key `storymaker.library.v1` is the shelf index (book id, title, tagline, spine color).
- `localStorage` key `storymaker.book.<id>` is that story’s JSON.
- Older builds used one key, `storymaker.project.v1`. The first launch copies that into a book.
- IndexedDB database `storymaker`: object store `tracks` holds music bytes; object store `handles` holds each book’s Obsidian folder (`book:<book id>`). A browser link is a folder handle. A desktop link is the folder path. A browser import that only read the files stores `name:<folder name>` so the settings line can say which folder was opened.
- The Tauri command `save_project` / `load_project` writes the open story to `project.json` in the OS app data directory. On Windows that is `%APPDATA%\com.storymaker.desktop\project.json`. It is a mirror of the open book, not the whole shelf.

There is no project folder of Markdown until the user links one.

## Obsidian

Settings → Obsidian vault. Each person, lore note, scene, thread, and mood card becomes a Markdown file with YAML frontmatter (`storymaker: person` and so on) and `[[wikilinks]]`. The vision board is `Vision.canvas`. Pictures and music go in `attachments/`. Bonds are `Bonds.md`. The calendar is `Calendar.md`. Theme and word counts sit in `.storymaker/comfort.json`.

**Choose vault folder** opens a folder window. Clicking the folder name only highlights it. Press **Select Folder** to confirm. In the Vite preview that reads the files and remembers the folder name; it does not keep writing back into that folder. In the desktop app the same button uses the Windows folder window, stores the path, loads notes already there, and keeps writing that folder while the book is open. Each book remembers its own folder.

**Download vault (.zip)** is the same tree. **Import vault folder** and **Import vault zip** bring notes back. A vault that contains `Story.md` replaces the open story. A People, Lore, Scene, Thread, or Mood note is read from its folder. Any other Markdown note is added as lore, on the shelf named by its parent folder, or on Notes if it sits at the vault root. Notes StoryMaker did not write are left in place. The file list StoryMaker owns is `.storymaker/files.json`.

Desktop folder commands, in `src-tauri/src/vault_fs.rs`: `pick_vault_folder`, `read_vault_folder`, `read_vault_text`, `write_vault_folder`. Do not use `showDirectoryPicker` for this. In this window it closes as soon as the folder is clicked and reports that no folder was chosen.

## Code map

- `src/App.tsx` switches the shelf and the rooms.
- `src/lib/store.tsx` is the story state (`StoryProvider`). Almost every edit goes through it.
- `src/lib/library.ts` loads and saves the shelf.
- `src/lib/normalize.ts` fills missing fields on old saves.
- `src/types.ts` is the project shape.
- `src/seed.ts` is Lantern and Tide.
- `src/views/` is one screen per room. `Shelf.tsx` is the bookcase.
- `src/components/Board.tsx` is the shared pan-and-zoom board for Bonds and Vision. A drag paints the card directly and does not rerender the board on every move.
- `src/lib/vault.ts` turns a project into Obsidian files and back.
- `src/lib/vaultFolder.ts` reads and writes a chosen folder and the zip.
- `src/lib/tracks.ts` stores music outside the JSON.
- `src/lib/ai.ts` builds the AI Studio context packet. The room id is still `studio`.

A project object holds characters, relationships, bond kinds, lore, events, chapters, scenes, mood cards, the vision board, calendar months, comfort settings, and per-day word counts. Pictures on people, lore, mood, and vision photos are data URLs inside that JSON. Music on the vision board is `track:<id>` and the bytes live in IndexedDB.

## Working on it

- Stay offline and private. Do not add an account, telemetry, or a cloud model.
- AI Studio text is a suggestion until the user inserts it.
- Keep the sample story’s voice if you touch `seed.ts`. Do not invent a second sample world.
- New story fields must survive `normalizeProject`, or old shelves will drop them. Manuscript font and size live on comfort as `manuscriptFont` and `manuscriptScale`.
- The shelf book id and the project id are different. Switching books must not write one story into another book’s vault folder.
- Browser checks belong on http://127.0.0.1:1420. Choosing a vault folder needs a user gesture, and the test is not finished until **Select Folder** is pressed. Zip import and export can be tested without a gesture. Lumen on Home and in the rail is grey only while that book’s lamp is out.
