import { BD_GEO } from './bd-geo-data';

export { BD_GEO };

/** All division names, sorted. */
export const BD_DIVISIONS: readonly string[] = Object.keys(BD_GEO);

export function districtsOf(division: string): readonly string[] {
  return Object.keys(BD_GEO[division] ?? {});
}

/**
 * Upazilas of a district. City areas (for example Mirpur in Dhaka) are not upazilas, so the
 * address form allows leaving the upazila empty.
 */
export function upazilasOf(division: string, district: string): readonly string[] {
  return BD_GEO[division]?.[district] ?? [];
}

export type GeoCheck = { ok: true } | { ok: false; path: 'division' | 'district' | 'upazila' };

/** Server-side check of an address: the district must be in the division, the upazila in the district. */
export function checkBdAddress(
  division: string,
  district: string,
  upazila?: string | null,
): GeoCheck {
  const districts = BD_GEO[division];
  if (!districts) return { ok: false, path: 'division' };
  const upazilas = districts[district];
  if (!upazilas) return { ok: false, path: 'district' };
  if (upazila && !upazilas.includes(upazila)) return { ok: false, path: 'upazila' };
  return { ok: true };
}
