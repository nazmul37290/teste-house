'use client';

import type { Permission } from '@/lib/admin-types';

/** Checkboxes grouped by module, with a "select all" per module. */
export function PermissionPicker({
  permissions,
  selected,
  onChange,
  disabled,
}: {
  permissions: Permission[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const modules = [...new Set(permissions.map((p) => p.module))];
  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(next);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {modules.map((module) => {
        const items = permissions.filter((p) => p.module === module);
        const keys = items.map((p) => p.key);
        const all = keys.every((k) => selected.has(k));
        return (
          <fieldset
            key={module}
            className="rounded-md border border-neutral-200 p-3"
            disabled={disabled}
          >
            <legend className="px-1 text-sm font-semibold capitalize text-neutral-800">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={all}
                  onChange={(e) => toggle(keys, e.target.checked)}
                />
                {module}
              </label>
            </legend>
            <div className="mt-1 space-y-1">
              {items.map((p) => (
                <label key={p.key} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(p.key)}
                    onChange={(e) => toggle([p.key], e.target.checked)}
                  />
                  <span>
                    <span className="font-mono text-xs text-neutral-700">{p.key}</span>
                    {p.description ? (
                      <span className="block text-xs text-neutral-500">{p.description}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
