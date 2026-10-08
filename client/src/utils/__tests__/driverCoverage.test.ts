import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalCoverage, driverCoverageMatch, rankDriversByCoverage } from '../driverCoverage';

test('an exact Area covers only that Area, case-insensitively', () => {
  assert.equal(driverCoverageMatch(['Makati CBD'], 'Makati CBD'), 'area');
  assert.equal(driverCoverageMatch(['makati cbd'], 'MAKATI CBD'), 'area');
  assert.equal(driverCoverageMatch(['Makati CBD'], 'BGC (Taguig)'), null, 'Same subregion, different Area');
});

test('an explicit Subregion covers every Area inside it', () => {
  for (const area of ['Mandaluyong', 'Ortigas Center (Pasig)', 'San Juan', 'Pasig - Kapitolyo']) {
    assert.equal(driverCoverageMatch(['Ortigas Corridor'], area), 'subregion', area);
  }
  assert.equal(driverCoverageMatch(['Ortigas Corridor'], 'Makati CBD'), null);
});

test('one covered Area never implies its whole Subregion', () => {
  // Manila - Ermita and Quezon City - Diliman share "Central QC / Manila".
  assert.equal(driverCoverageMatch(['Manila - Ermita'], 'Quezon City - Diliman'), null);
  assert.equal(driverCoverageMatch(['Manila - Ermita'], 'Manila - Binondo'), null);
});

test('no substring or fuzzy matching, and unknown or empty areas match nothing', () => {
  assert.equal(driverCoverageMatch(['Manila'], 'Metro Manila'), null);
  assert.equal(driverCoverageMatch(['Pasig'], 'Pasig - Kapitolyo'), null);
  assert.equal(driverCoverageMatch(['Makati'], 'Makati CBD'), null);
  assert.equal(driverCoverageMatch(['Makati CBD'], 'Makati'), null);
  assert.equal(driverCoverageMatch(['Metro Manila'], 'Metro Manila'), null, 'A region or legacy value is not an Area');
  assert.equal(driverCoverageMatch(['Makati CBD'], ''), null);
  assert.equal(driverCoverageMatch([], 'Makati CBD'), null);
});

test('drivers are grouped exact Area, then explicit Subregion, then everyone else (still selectable)', () => {
  const coverage: Record<string, string[]> = {
    Lando: ['Makati CBD', 'Ortigas Corridor'],
    Manny: ['Central QC / Manila'],
    Ronald: ['Manila - Ermita'],
    Leo: [],
  };
  const drivers = ['Lando', 'Manny', 'Ronald', 'Leo'];
  assert.deepEqual(rankDriversByCoverage(drivers, d => coverage[d], 'Manila - Ermita'),
    { area: ['Ronald'], subregion: ['Manny'], other: ['Lando', 'Leo'], subregionName: 'Central QC / Manila' });
  assert.deepEqual(rankDriversByCoverage(drivers, d => coverage[d], 'Quezon City - Diliman'),
    { area: [], subregion: ['Manny'], other: ['Lando', 'Ronald', 'Leo'], subregionName: 'Central QC / Manila' });
  const legacy = rankDriversByCoverage(drivers, d => coverage[d], 'Metro Manila');
  assert.deepEqual(legacy.other, drivers, 'Legacy broad areas rank nobody but keep every Driver available');
  assert.equal(legacy.subregionName, null);
});

test('canonical names are recognised for Areas and Subregions only', () => {
  assert.equal(canonicalCoverage('makati cbd'), 'Makati CBD');
  assert.equal(canonicalCoverage('ortigas corridor'), 'Ortigas Corridor');
  assert.equal(canonicalCoverage('Metro Manila (NCR)'), null);
  assert.equal(canonicalCoverage('Makati'), null);
});
