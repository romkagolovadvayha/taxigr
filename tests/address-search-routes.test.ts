import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ firstRow: vi.fn(), authenticate: vi.fn(), search: vi.fn(), places: vi.fn() }));
vi.mock('../server/db', () => ({ db: { query: vi.fn(async () => [[]]), execute: vi.fn() }, firstRow: mocks.firstRow }));
vi.mock('../server/security', async original => ({ ...await original<typeof import('../server/security')>(), authenticate: mocks.authenticate }));
vi.mock('../server/geocoding', () => ({ searchAddresses: mocks.search }));
vi.mock('../server/places', async original => ({ ...await original<typeof import('../server/places')>(), searchPlaces: mocks.places }));
import { registerRoutes } from '../server/routes';

const app = Fastify();
beforeAll(async () => { await registerRoutes(app, vi.fn(), { disconnectUser: vi.fn() }); });
afterAll(() => app.close());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticate.mockResolvedValue({ id: 'passenger', roles: ['passenger'] });
  mocks.firstRow.mockResolvedValue({ blocked_at: null });
  mocks.search.mockResolvedValue([]);
  mocks.places.mockResolvedValue([]);
});

describe('fast address suggestions API', () => {
  it.each(['/v1/addresses/search', '/v1/addresses/preview'])('uses local data and cache while typing: %s', async path => {
    const response = await app.inject({ url: path + '?query=Магн&mode=suggest' });
    expect(response.statusCode).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith('Магн', false, false, true);
  });
  it('returns a known place without waiting for external maps, including for older apps', async () => {
    mocks.places.mockResolvedValue([{ id: 'hospital', name: 'Больница', addressLabel: 'ул. Ачинцева, 20', category: 'health',
      houseNumber: '20', coordinates: { latitude: 56.05, longitude: 51.95 } }]);
    const response = await app.inject({ url: '/v1/addresses/search?query=Больница' });
    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].placeId).toBe('hospital');
    expect(mocks.search).toHaveBeenCalledWith('Больница', false, false, true);
  });
  it('keeps full external search for submitted unknown addresses', async () => {
    await app.inject({ url: '/v1/addresses/search?query=Неизвестный' });
    expect(mocks.search).toHaveBeenCalledWith('Неизвестный', false, false, false);
  });
  it('still resolves an approximate house precisely after selection', async () => {
    await app.inject({ url: '/v1/addresses/search?query=Грахово%20Новая%201&kind=house' });
    expect(mocks.places).not.toHaveBeenCalled();
    expect(mocks.search).toHaveBeenCalledWith('Грахово Новая 1', false, true, false);
  });
});
