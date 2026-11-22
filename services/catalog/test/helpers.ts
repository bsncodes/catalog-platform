import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pino } from 'pino';
import { FixtureProductProvider } from '../src/products/fixtureProvider.js';

export const fixturePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'products.json');
export const fixtureProvider = (): FixtureProductProvider => FixtureProductProvider.fromFile(fixturePath, 'USD');
export const silentLogger = pino({ level: 'silent' });
export const FEATURED = ['1', '5', '9', '12', '18'] as const;
