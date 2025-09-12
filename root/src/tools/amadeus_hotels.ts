import { getAmadeusClient } from '../vendors/amadeus_client.js';
import { withPolicies } from './_sdk_policies.js';
import { toStdError } from './errors.js';

export interface HotelSearchQuery {
  cityCode?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  radiusUnit?: 'KM' | 'MILE';
  chainCodes?: string;
  amenities?: string[];
  ratings?: string[];
  hotelSource?: string;
}

export interface HotelOffersQuery extends HotelSearchQuery {
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  roomQuantity?: number;
  priceRange?: string;
  currency?: string;
  paymentPolicy?: string;
  boardType?: string;
}

/**
 * Search hotel offers using Amadeus SDK.
 */
export async function hotelOffersSearch(
  query: HotelOffersQuery,
  signal?: AbortSignal
): Promise<any> {
  try {
    return await withPolicies(async () => {
      const amadeus = await getAmadeusClient();
      
      const params = {
        checkInDate: query.checkInDate,
        checkOutDate: query.checkOutDate,
        adults: query.adults,
        ...(query.cityCode && { cityCode: query.cityCode }),
        ...(query.latitude && query.longitude && {
          latitude: query.latitude,
          longitude: query.longitude,
        }),
        ...(query.radius && { radius: query.radius }),
        ...(query.radiusUnit && { radiusUnit: query.radiusUnit }),
        ...(query.chainCodes && { chainCodes: query.chainCodes }),
        ...(query.amenities && { amenities: query.amenities }),
        ...(query.ratings && { ratings: query.ratings }),
        ...(query.roomQuantity && { roomQuantity: query.roomQuantity }),
        ...(query.priceRange && { priceRange: query.priceRange }),
        ...(query.currency && { currency: query.currency }),
        ...(query.paymentPolicy && { paymentPolicy: query.paymentPolicy }),
        ...(query.boardType && { boardType: query.boardType }),
        ...(query.hotelSource && { hotelSource: query.hotelSource }),
      };
      
      const response = await amadeus.shopping.hotelOffersSearch.get(params);
      return response.data;
    }, signal, 8000);
  } catch (error) {
    const stdError = toStdError(error, 'hotelOffersSearch');
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}

/**
 * Search hotels by city using reference data.
 */
export async function searchHotelsByCity(
  cityCode: string,
  signal?: AbortSignal
): Promise<any> {
  try {
    return await withPolicies(async () => {
      const amadeus = await getAmadeusClient();
      
      const response = await amadeus.referenceData.locations.hotels.byCity.get({
        cityCode,
      });
      
      return response.data;
    }, signal, 4000);
  } catch (error) {
    const stdError = toStdError(error, 'searchHotelsByCity');
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}

/**
 * Get hotel details by hotel ID.
 */
export async function getHotelById(
  hotelId: string,
  signal?: AbortSignal
): Promise<any> {
  try {
    return await withPolicies(async () => {
      const amadeus = await getAmadeusClient();
      
      const response = await amadeus.referenceData.locations.hotels.byHotels.get({
        hotelIds: hotelId,
      });
      
      return response.data;
    }, signal, 4000);
  } catch (error) {
    const stdError = toStdError(error, 'getHotelById');
    throw new Error(`${stdError.code}: ${stdError.message}`);
  }
}
