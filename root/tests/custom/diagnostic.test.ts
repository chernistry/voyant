describe('Diagnostic Tests', () => {
  test('imports work correctly', async () => {
    console.log('Testing imports...');

    try {
      console.log('Importing router...');
      const { router } = await import('../../src/api/routes.js');
      console.log('Router imported successfully');

      console.log('Importing handleChat...');
      const { handleChat } = await import('../../src/core/blend.js');
      console.log('handleChat imported successfully');

      console.log('Importing pino...');
      const pino = (await import('pino')).default;
      console.log('Pino imported successfully');

      console.log('All imports successful!');
      expect(true).toBe(true);
    } catch (error) {
      console.error('Import error:', error);
      throw error;
    }
  }, 10000);

  test('express app can be created', async () => {
    console.log('Testing Express app creation...');

    try {
      const express = (await import('express')).default;
      const pino = (await import('pino')).default;
      const { router } = await import('../../src/api/routes.js');

      console.log('Creating Express app...');
      const log = pino({ level: 'silent' });
      const app = express();
      app.use(express.json());
      app.use('/', router(log));

      console.log('Express app created successfully');
      expect(app).toBeDefined();
    } catch (error) {
      console.error('Express app creation error:', error);
      throw error;
    }
  }, 10000);
});
