import test from 'node:test';
import assert from 'node:assert/strict';
import { AREA_HIERARCHY } from '../../data';
import { DEMO_LOCATION_FIXTURES, demoLocationIndex, selectDemoLocation } from '../demoLocations';

const canonicalAreas = new Set(AREA_HIERARCHY.flatMap(region =>
  region.subregions.flatMap(subregion => subregion.areas),
));

test('every demo location uses an exact canonical AREA_HIERARCHY area and a nonblank address', () => {
  assert.ok(DEMO_LOCATION_FIXTURES.length > 0);
  for (const fixture of DEMO_LOCATION_FIXTURES) {
    assert.ok(canonicalAreas.has(fixture.area), `${fixture.area} must be canonical`);
    assert.ok(fixture.address.trim(), `${fixture.area} must have an address`);
  }
});

test('selection returns one intact fixture so Area and Address cannot come from different rows', () => {
  for (let index = 0; index < DEMO_LOCATION_FIXTURES.length; index++) {
    const selected = selectDemoLocation((index + 0.5) / DEMO_LOCATION_FIXTURES.length);
    assert.equal(selected, DEMO_LOCATION_FIXTURES[index]);
    assert.deepEqual(selected, {
      area: DEMO_LOCATION_FIXTURES[index].area,
      address: DEMO_LOCATION_FIXTURES[index].address,
    });
  }
});

test('deterministic index boundaries select the first and last fixtures safely', () => {
  assert.equal(demoLocationIndex(0), 0);
  assert.equal(demoLocationIndex(Number.MIN_VALUE), 0);
  assert.equal(demoLocationIndex(1 - Number.EPSILON), DEMO_LOCATION_FIXTURES.length - 1);
  assert.equal(demoLocationIndex(1), DEMO_LOCATION_FIXTURES.length - 1);
  assert.equal(demoLocationIndex(-1), 0);
});

test('BGC fixture maps to a Taguig and BGC address', () => {
  const bgc = DEMO_LOCATION_FIXTURES.find(fixture => fixture.area === 'BGC (Taguig)');
  assert.ok(bgc);
  assert.match(bgc.address, /BGC/i);
  assert.match(bgc.address, /Taguig/i);
});
