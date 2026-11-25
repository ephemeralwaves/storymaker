import type { ReactNode } from "react";
import { shrinkImage } from "../lib/util";

export function Lumen({ size = 72, lit = true }: { size?: number; lit?: boolean }) {
  return (
    <svg className={lit ? "lumen" : "lumen out"} width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
      <ellipse cx="40" cy="70" rx="16" ry="4" fill="currentColor" opacity="0.15" />
      <path d="M22 34c0-12 8-20 18-20s18 8 18 20v16c0 8-8 14-18 14s-18-6-18-14V34z" fill="#f4d7a4" />
      <path d="M24 28c2-10 8-16 10-16 1 6-2 12-8 16" fill="#e7b56a" />
      <path d="M56 28c-2-10-8-16-10-16-1 6 2 12 8 16" fill="#e7b56a" />
      <circle cx="33" cy="40" r="2.2" fill="#3c291f" />
      <circle cx="47" cy="40" r="2.2" fill="#3c291f" />
      <path d="M36 48c2 2 6 2 8 0" fill="none" stroke="#3c291f" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="34" y="14" width="12" height="10" rx="3" fill="#f2c14e" />
      <path d="M40 8v6" stroke="#e2a15a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="19" r="3" fill="#fff4d2" />
    </svg>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
    </div>
  );
}

export function PictureField({ image, onChange }: { image: string; onChange: (image: string) => void }) {
  return (
    <Field label="Picture">
      <div className="portrait-row">
        {image ? <img className="portrait" src={image} alt="" /> : <p className="muted">No picture yet. It appears on the vision board when this page is pinned.</p>}
        <div className="row">
          <label className="btn">
            {image ? "Replace picture" : "Add a picture"}
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void shrinkImage(file).then(onChange);
              }}
            />
          </label>
          {image ? (
            <button type="button" className="text-btn" onClick={() => onChange("")}>
              Remove picture
            </button>
          ) : null}
        </div>
      </div>
    </Field>
  );
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Lumen />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
