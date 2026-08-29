// Schliesst das Modal, sobald aus einer abgefangenen Route heraus per
// router.push auf eine andere Seite navigiert wird (z.B. /scan-ean ->
// /confirm?barcode=...). Bei Soft-Navigation behaelt ein Parallel-Slot
// naemlich seinen zuletzt aktiven Inhalt, wenn die neue URL im Slot kein
// Segment matcht - default.tsx greift nur beim Hard-Load. Der Slot muss
// deshalb auf eine Route treffen, die null rendert (siehe
// node_modules/next/dist/docs/.../parallel-routes.md, Abschnitt "Closing
// the modal").
export default function CatchAll() {
  return null;
}
