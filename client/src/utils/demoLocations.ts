export interface DemoLocationFixture {
  readonly area: string;
  readonly address: string;
}

export const DEMO_LOCATION_FIXTURES: readonly DemoLocationFixture[] = [
  { area: 'BGC (Taguig)', address: 'Unit 2A, Bonifacio High Street, BGC, Taguig City' },
  { area: 'Makati CBD', address: 'Ayala Avenue corner Paseo de Roxas, Makati City' },
  { area: 'Ortigas Center (Pasig)', address: 'ADB Avenue, Ortigas Center, Pasig City' },
  { area: 'Quezon City - Fairview', address: 'Commonwealth Avenue, Fairview, Quezon City' },
  { area: 'Manila - Binondo', address: 'Quintin Paredes Road, Binondo, Manila' },
  { area: 'Clark Freeport Zone, Pampanga', address: 'Manuel A. Roxas Highway, Clark Freeport Zone, Pampanga' },
  { area: 'Baguio City, Benguet', address: 'Session Road, Baguio City, Benguet' },
  { area: 'Sta. Rosa, Laguna', address: 'Santa Rosa–Tagaytay Road, Santa Rosa, Laguna' },
  { area: 'Cebu City', address: 'Cebu Business Park, Cebu City' },
  { area: 'Iloilo City', address: 'Megaworld Boulevard, Iloilo Business Park, Iloilo City' },
  { area: 'Davao City', address: 'J.P. Laurel Avenue, Bajada, Davao City' },
  { area: 'Cagayan de Oro City', address: 'C.M. Recto Avenue, Cagayan de Oro City' },
] as const;

export function demoLocationIndex(randomValue: number, length = DEMO_LOCATION_FIXTURES.length) {
  if (!Number.isInteger(length) || length <= 0) throw new RangeError('A demo location list must not be empty.');
  if (!Number.isFinite(randomValue)) return 0;
  return Math.min(length - 1, Math.max(0, Math.floor(randomValue * length)));
}

export function selectDemoLocation(randomValue = Math.random()): DemoLocationFixture {
  return DEMO_LOCATION_FIXTURES[demoLocationIndex(randomValue)];
}
