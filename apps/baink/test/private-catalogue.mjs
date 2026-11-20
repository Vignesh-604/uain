// The research catalogue (apps/baink/catalogue/) is private and is not in the public repository
// (README.md). Tests that read it run where it is present, such as a release checkout, and are
// reported as skipped, with this reason, where it is not (19 November 2026). Before this, those
// tests failed on every branch, and one left a half-built server open until the suite deadline.
import base from 'node:test';
import { existsSync } from 'node:fs';
export const CATALOGUE = new URL('../catalogue/', import.meta.url).pathname;
export const catalogueSkip =
  existsSync(CATALOGUE + 'index.json') || existsSync(CATALOGUE + 'inactive.json')
    ? false
    : 'needs the private research catalogue (apps/baink/catalogue/), which is not in this repository';
/** node:test's test(), skipped with the reason above when the private catalogue is absent. */
export const catalogueTest = catalogueSkip
  ? (name) => base(name, { skip: catalogueSkip }, () => {})
  : base;
