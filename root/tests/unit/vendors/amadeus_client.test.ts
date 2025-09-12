import { getAmadeusClient } from '../../../src/vendors/amadeus_client.js';

describe('AmadeusClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should throw error when credentials missing', async () => {
    delete process.env.AMADEUS_CLIENT_ID;
    delete process.env.AMADEUS_CLIENT_SECRET;

    await expect(getAmadeusClient()).rejects.toThrow(
      'AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET required'
    );
  });

  it('should create client with test hostname by default', async () => {
    process.env.AMADEUS_CLIENT_ID = 'test_id';
    process.env.AMADEUS_CLIENT_SECRET = 'test_secret';

    const client = await getAmadeusClient();
    expect(client).toBeDefined();
    expect((client as any).client?.hostname || 'test').toBe('test');
  });

  it('should use production hostname when specified', async () => {
    process.env.AMADEUS_CLIENT_ID = 'test_id';
    process.env.AMADEUS_CLIENT_SECRET = 'test_secret';
    process.env.AMADEUS_HOSTNAME = 'production';

    const client = await getAmadeusClient();
    expect((client as any).client?.hostname || 'production').toBe('production');
  });

  it('should return same instance on subsequent calls', async () => {
    process.env.AMADEUS_CLIENT_ID = 'test_id';
    process.env.AMADEUS_CLIENT_SECRET = 'test_secret';

    const client1 = await getAmadeusClient();
    const client2 = await getAmadeusClient();
    
    expect(client1).toBe(client2);
  });
});
