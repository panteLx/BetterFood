/**
 * Vier schematische Szenen fuer das Onboarding.
 *
 * Bewusst als Inline-SVG aus denselben Farbtokens wie der Rest der App und
 * nicht als Bilddatei: sie folgen so dem hellen wie dem dunklen Modus, kosten
 * keinen zusaetzlichen Ladevorgang vor dem ersten Screen und zeigen exakt die
 * Formen, die der Nutzer gleich danach in echt sieht.
 */

const frame = "h-full w-full";

export function StockIllustration() {
  return (
    <svg viewBox="0 0 240 150" fill="none" className={frame} aria-hidden="true">
      <rect
        x="62"
        y="14"
        width="116"
        height="122"
        rx="16"
        className="fill-[var(--card)] stroke-border"
        strokeWidth="2"
      />
      <path d="M62 62h116" className="stroke-border" strokeWidth="2" />
      <path d="M62 102h116" className="stroke-border" strokeWidth="2" />
      <rect x="76" y="30" width="26" height="22" rx="6" className="fill-primary" />
      <rect x="110" y="34" width="20" height="18" rx="6" className="fill-[var(--warning)]" />
      <rect x="138" y="26" width="26" height="26" rx="8" className="fill-[var(--primary-tint)]" />
      <rect x="76" y="72" width="42" height="20" rx="6" className="fill-[var(--surface-2)]" />
      <rect x="126" y="72" width="38" height="20" rx="6" className="fill-[var(--danger)]" />
      <rect x="76" y="112" width="88" height="14" rx="6" className="fill-[var(--surface-2)]" />
    </svg>
  );
}

export function ScanIllustration() {
  return (
    <svg viewBox="0 0 240 150" fill="none" className={frame} aria-hidden="true">
      <rect
        x="52"
        y="34"
        width="136"
        height="82"
        rx="18"
        className="fill-[var(--card)] stroke-border"
        strokeWidth="2"
      />
      {[0, 1, 2, 3, 4, 5, 6].map((index) => (
        <rect
          key={index}
          x={74 + index * 14}
          y="52"
          width={index % 3 === 0 ? 6 : 3}
          height="46"
          rx="1.5"
          className="fill-foreground"
        />
      ))}
      <rect x="64" y="72" width="112" height="5" rx="2.5" className="fill-primary" />
      <path
        d="M52 34h-14v-14M188 34h14v-14M52 116h-14v14M188 116h14v14"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SwipeIllustration() {
  return (
    <svg viewBox="0 0 240 150" fill="none" className={frame} aria-hidden="true">
      <rect x="14" y="52" width="212" height="46" rx="16" className="fill-[var(--primary-tint)]" />
      <path
        d="M34 75h16m-16 0 6-6m-6 6 6 6"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M206 75h-16m16 0-6-6m6 6-6 6"
        className="stroke-[var(--danger)]"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="62"
        y="46"
        width="116"
        height="58"
        rx="16"
        className="fill-[var(--card)] stroke-border"
        strokeWidth="2"
      />
      <rect x="62" y="46" width="4" height="58" className="fill-[var(--warning)]" />
      <rect x="78" y="60" width="28" height="28" rx="9" className="fill-[var(--warning-tint)]" />
      <rect x="116" y="62" width="48" height="8" rx="4" className="fill-[var(--surface-2)]" />
      <rect x="116" y="78" width="30" height="8" rx="4" className="fill-[var(--surface-2)]" />
    </svg>
  );
}

export function ReminderIllustration() {
  return (
    <svg viewBox="0 0 240 150" fill="none" className={frame} aria-hidden="true">
      <rect
        x="34"
        y="40"
        width="172"
        height="62"
        rx="18"
        className="fill-[var(--card)] stroke-border"
        strokeWidth="2"
      />
      <rect x="50" y="56" width="30" height="30" rx="10" className="fill-primary" />
      <path
        d="M58 78c0-6.5 4.5-11 11-11 0 6.5-4.5 11-11 11Zm2.5-2.5 5-5"
        className="stroke-[var(--primary-foreground)]"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="92" y="58" width="72" height="9" rx="4.5" className="fill-foreground" />
      <rect x="92" y="74" width="98" height="8" rx="4" className="fill-[var(--surface-2)]" />
      <circle cx="196" cy="42" r="9" className="fill-[var(--danger)]" />
    </svg>
  );
}
