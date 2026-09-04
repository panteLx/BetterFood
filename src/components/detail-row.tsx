import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Eine Zeile der Eckdaten-Liste: Beschriftung links, Wert rechts, Haarlinie
 * darunter -- ausser bei der letzten.
 *
 * Steht seit dem Frischling-Umbau als eigener Baustein und nicht mehr nur in
 * item-detail.tsx: /saved zeigt dieselbe Liste in klein ("Haltbar bis",
 * "Im Vorrat") und hatte sie Klasse fuer Klasse nachgebaut. Zwei Abschriften
 * derselben Zeile laufen bei der naechsten Massaenderung auseinander.
 *
 * `dt`/`dd` und nicht `span`: die Liste ist ein Beschriftungs-Wert-Paar, und
 * der Aufrufer setzt entsprechend ein `<dl>` darum.
 */
export function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 py-3.5", !last && "border-b border-hairline")}>
      <dt className="flex-1 text-left text-[13.5px] font-semibold text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right font-heading text-[14.5px] font-bold">{value}</dd>
    </div>
  );
}

/**
 * Die getoente Mengen-Pille, wie sie in den Eckdaten und auf /saved steht.
 */
export function QuantityPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[26px] items-center rounded-full bg-primary-tint px-[11px] font-heading text-sm font-bold text-primary-deep">
      {children}
    </span>
  );
}
