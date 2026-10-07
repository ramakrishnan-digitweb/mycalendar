import { useMemo } from 'react';
import { allZones, zoneLabel } from '../lib/time';
import { Select } from './ui';

export function TimezoneSelect({ value, onChange, id }: { value: string; onChange: (z: string) => void; id?: string }) {
  const zones = useMemo(() => {
    const list = allZones();
    return list.includes(value) ? list : [value, ...list];
  }, [value]);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {zones.map((z) => (
        <option key={z} value={z}>
          {zoneLabel(z)}
        </option>
      ))}
    </Select>
  );
}
