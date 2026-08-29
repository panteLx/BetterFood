// Gegenstueck zu @modal/[...catchAll]: der Catch-all matcht die Startseite
// ("/") nicht, ohne diese Datei bliebe ein offenes Modal beim Navigieren
// zurueck auf "/" sichtbar.
export default function ModalSlotRoot() {
  return null;
}
