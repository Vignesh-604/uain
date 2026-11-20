// These cases read the private research catalogue (apps/baink/catalogue/), which is not in this
// repository, from the top of the file. They run where it is staged and report one skip, with
// that reason, where it is not (19 November 2026); before, the whole file failed on every branch.
import test from 'node:test';
import { catalogueSkip } from '../../../apps/baink/test/private-catalogue.mjs';
if (catalogueSkip) test('fund-rounds cases', { skip: catalogueSkip }, () => {});
else await import('./fund-rounds.cases.mjs');
