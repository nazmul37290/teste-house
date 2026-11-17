'use client';

import { BD_DIVISIONS, districtsOf, upazilasOf } from '@shop/shared';
import { Field, Select, Textarea } from '@/components/ui';

export type AddressValue = {
  division: string;
  district: string;
  upazila: string;
  addressLine: string;
};

export const EMPTY_ADDRESS: AddressValue = {
  division: '',
  district: '',
  upazila: '',
  addressLine: '',
};

/**
 * Division -> district -> upazila dropdowns (bundled dataset) plus the street address. The upazila is
 * optional: city areas such as Mirpur are not upazilas. The server checks the same data.
 */
export function AddressFields({
  idPrefix,
  value,
  onChange,
  error = () => undefined,
}: {
  idPrefix: string;
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  error?: (field: string) => string | undefined;
}) {
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch });
  const districts = value.division ? districtsOf(value.division) : [];
  const upazilas = value.district ? upazilasOf(value.division, value.district) : [];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Division" htmlFor={`${idPrefix}-division`} error={error('division')}>
          <Select
            id={`${idPrefix}-division`}
            required
            value={value.division}
            onChange={(e) => set({ division: e.target.value, district: '', upazila: '' })}
          >
            <option value="">Choose…</option>
            {BD_DIVISIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="District" htmlFor={`${idPrefix}-district`} error={error('district')}>
          <Select
            id={`${idPrefix}-district`}
            required
            disabled={!value.division}
            value={value.district}
            onChange={(e) => set({ district: e.target.value, upazila: '' })}
          >
            <option value="">Choose…</option>
            {districts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Upazila / area" htmlFor={`${idPrefix}-upazila`} error={error('upazila')}>
          <Select
            id={`${idPrefix}-upazila`}
            disabled={!value.district}
            value={value.upazila}
            onChange={(e) => set({ upazila: e.target.value })}
          >
            <option value="">City area / not listed</option>
            {upazilas.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Address"
        htmlFor={`${idPrefix}-line`}
        hint="House, road, area, landmark."
        error={error('addressLine')}
      >
        <Textarea
          id={`${idPrefix}-line`}
          required
          minLength={5}
          maxLength={300}
          rows={2}
          autoComplete="street-address"
          value={value.addressLine}
          onChange={(e) => set({ addressLine: e.target.value })}
        />
      </Field>
    </>
  );
}
