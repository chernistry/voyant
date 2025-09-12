import { z } from 'zod';

export const AmadeusLocation = z.object({
  type: z.literal('location'),
  subType: z.enum(['AIRPORT','CITY','POINT_OF_INTEREST','DISTRICT']),
  id: z.string(),
  iataCode: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().optional(),
  detailedName: z.string().optional(),
  geoCode: z.object({ 
    latitude: z.number(), 
    longitude: z.number() 
  }).optional(),
  address: z.object({
    cityName: z.string().optional(),
    cityCode: z.string().regex(/^[A-Z]{3}$/).optional(),
    countryCode: z.string().length(2).optional(),
    countryName: z.string().optional(),
  }).optional(),
  analytics: z.object({ 
    travelers: z.object({ 
      score: z.number().optional() 
    }).optional() 
  }).optional(),
});

export const AmadeusLocationList = z.object({ 
  data: z.array(AmadeusLocation) 
});

export type TLocation = z.infer<typeof AmadeusLocation>;
