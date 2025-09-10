import { weatherTool } from '../../src/mastra/tools/weather.tool.js';
import * as weather from '../../src/tools/weather.js';

describe('weatherTool', () => {
  it('invokes getWeather with provided input', async () => {
    const spy = jest
      .spyOn(weather, 'getWeather')
      .mockResolvedValue({ ok: true, summary: 'sunny' } as any);
    await expect(
      weatherTool.execute?.({ context: { city: 'Paris' } } as any),
    ).resolves.toEqual({ ok: true, summary: 'sunny' });
    expect(spy).toHaveBeenCalledWith({ city: 'Paris' });
  });
});
