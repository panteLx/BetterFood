#!/usr/bin/env node
/**
 * Schneidet ein Release: Version anheben, taggen, pushen, Release-Notes
 * veröffentlichen.
 *
 * Warum ein Skript und kein Handbetrieb: die Reihenfolge ist die halbe Miete.
 * Wird der Tag vor dem Branch gepusht, baut `container.yml` ein Image aus
 * einem Commit, den auf main noch niemand hat; wird die Version ohne Tag
 * angehoben, zeigt die App eine Version an, zu der es kein Release gibt (die
 * Einstellungsseite verlinkt darauf, siehe src/lib/version.ts). Die Prüfungen
 * oben brechen deshalb lieber ab, als eine dieser Halbheiten anzurichten.
 *
 * Der gepushte Tag "vX.Y.Z" löst denselben Workflow aus wie ein Push auf
 * main -- nur ohne COMMIT_SHA als Build-Argument, damit das Image sich als
 * Release ausgibt und nicht als Zwischenstand.
 *
 * Aufruf: `npm run release patch|minor|major|X.Y.Z` (braucht die GitHub CLI,
 * angemeldet über `gh auth login`).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Die Adresse des Repositorys steht in package.json, nicht hier: die App
// verlinkt dieselbe (next.config.ts reicht sie an src/lib/version.ts durch),
// und zwei Kopien laufen bei einer Umbenennung auseinander -- die in der App
// still, weil eine tote Verlinkung niemandem auffällt.
const { repository } = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf-8"),
);
const REPOSITORY = repository.url;

const RELEASE_BRANCH = "main";
const VALID_BUMPS = [
  "patch",
  "minor",
  "major",
  "prepatch",
  "preminor",
  "premajor",
  "prerelease",
];

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

function capture(cmd) {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function fail(message) {
  console.error(`\nrelease: ${message}`);
  process.exit(1);
}

const bump = process.argv[2];
if (!bump) {
  fail(`missing version argument. Usage: npm run release <${VALID_BUMPS.join("|")}|X.Y.Z>`);
}
if (!VALID_BUMPS.includes(bump) && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(bump)) {
  fail(`invalid version argument "${bump}".`);
}

const branch = capture("git rev-parse --abbrev-ref HEAD");
if (branch !== RELEASE_BRANCH) {
  fail(`must be run from "${RELEASE_BRANCH}" (currently on "${branch}").`);
}

// `npm version` committet alles, was es anfasst -- bei einem schmutzigen Baum
// wären das auch fremde Änderungen, unter der Nachricht "chore(release)".
if (capture("git status --porcelain")) {
  fail("working directory is not clean. Commit or stash your changes first.");
}

try {
  capture("gh auth status");
} catch {
  fail('GitHub CLI is not authenticated. Run "gh auth login" first.');
}

console.log(`release: fetching latest ${RELEASE_BRANCH} from origin...`);
run(`git fetch origin ${RELEASE_BRANCH}`);
// Sonst zeigt der Tag auf einen lokalen Stand, und der Push des Branches
// scheitert danach -- der Tag wäre dann schon draußen.
if (capture("git rev-parse HEAD") !== capture(`git rev-parse origin/${RELEASE_BRANCH}`)) {
  fail(`local ${RELEASE_BRANCH} is out of sync with origin/${RELEASE_BRANCH}. Pull or push first.`);
}

console.log(`release: bumping version (${bump})...`);
const tag = capture(`npm version ${bump} -m "chore(release): v%s"`);

console.log(`release: pushing ${RELEASE_BRANCH} and ${tag} to origin...`);
run(`git push origin ${RELEASE_BRANCH}`);
run(`git push origin ${tag}`);

console.log("release: creating GitHub release with auto-generated notes...");
run(`gh release create ${tag} --title ${tag} --generate-notes`);

console.log(`\nrelease: ${tag} published.`);
console.log(`release: container image build: ${REPOSITORY}/actions/workflows/container.yml`);
console.log(`release: notes: ${REPOSITORY}/releases/tag/${tag}`);
