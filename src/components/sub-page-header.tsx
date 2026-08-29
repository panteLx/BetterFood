"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Zurueck-Pfeil und Titel fuer jede Unterseite von "Mehr".
 *
 * router.back() statt eines festen Ziels: die Datenbank ist sowohl aus den
 * Einstellungen als auch aus dem Formular heraus erreichbar, und ein fester
 * Link wuerde den Nutzer von dort woanders hin entlassen, als er hergekommen
 * ist.
 */
export function SubPageHeader({ title }: { title: string }) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2.5">
      <Button
        variant="ghost"
        size="icon-touch"
        aria-label="Zurück"
        onClick={() => router.back()}
        className="-ml-2 rounded-2xl"
      >
        <ArrowLeft className="size-5.5" />
      </Button>
      <h1 className="text-xl leading-tight">{title}</h1>
    </div>
  );
}
