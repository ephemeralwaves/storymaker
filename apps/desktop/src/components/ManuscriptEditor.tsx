import { Markdown } from "@tiptap/markdown";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState } from "react";

type Mode = "write" | "markdown";

interface ManuscriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  fontFamily: string;
  fontSize: string;
  placeholder?: string;
}

export function ManuscriptEditor({
  value,
  onChange,
  fontFamily,
  fontSize,
  placeholder = "Write the piece that is alive. Structure can come later.",
}: ManuscriptEditorProps) {
  const [mode, setMode] = useState<Mode>("write");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const applyingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        code: false,
      }),
      Markdown,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "manuscript-prose",
        "aria-label": "Scene manuscript",
      },
    },
    onUpdate: ({ editor: current }) => {
      if (applyingRef.current) return;
      onChangeRef.current(current.getMarkdown());
    },
  });

  useEffect(() => {
    if (!editor || mode !== "write") return;
    const current = editor.getMarkdown();
    if (current === value) return;
    applyingRef.current = true;
    editor.commands.setContent(value, { contentType: "markdown" });
    applyingRef.current = false;
  }, [editor, value, mode]);

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "markdown" && editor) {
      onChange(editor.getMarkdown());
    }
    if (next === "write" && editor) {
      applyingRef.current = true;
      editor.commands.setContent(value, { contentType: "markdown" });
      applyingRef.current = false;
    }
    setMode(next);
  };

  const run = (command: () => boolean) => {
    if (!editor) return;
    command();
  };

  return (
    <div className="manuscript-shell" style={{ fontFamily, fontSize }}>
      <div className="manuscript-toolbar">
        <div className="row wrap">
          <button
            type="button"
            className={mode === "write" ? "btn primary" : "btn"}
            onClick={() => switchMode("write")}
          >
            Write
          </button>
          <button
            type="button"
            className={mode === "markdown" ? "btn primary" : "btn"}
            onClick={() => switchMode("markdown")}
          >
            Markdown
          </button>
        </div>
        {mode === "write" ? (
          <div className="row wrap manuscript-format">
            <button type="button" className="btn" disabled={!editor} onClick={() => run(() => editor!.chain().focus().toggleBold().run())}>
              Bold
            </button>
            <button type="button" className="btn" disabled={!editor} onClick={() => run(() => editor!.chain().focus().toggleItalic().run())}>
              Italic
            </button>
            <button type="button" className="btn" disabled={!editor} onClick={() => run(() => editor!.chain().focus().toggleHeading({ level: 2 }).run())}>
              Heading
            </button>
            <button type="button" className="btn" disabled={!editor} onClick={() => run(() => editor!.chain().focus().toggleBulletList().run())}>
              List
            </button>
            <button type="button" className="btn" disabled={!editor} onClick={() => run(() => editor!.chain().focus().toggleBlockquote().run())}>
              Quote
            </button>
          </div>
        ) : (
          <p className="muted manuscript-hint">Editing the Markdown that Write mode stores.</p>
        )}
      </div>
      {mode === "markdown" ? (
        <textarea
          className="manuscript manuscript-source"
          style={{ fontFamily, fontSize }}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          spellCheck
        />
      ) : (
        <div className="manuscript-surface">
          <EditorContent editor={editor} />
        </div>
      )}
    </div>
  );
}
