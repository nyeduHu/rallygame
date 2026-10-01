// components/game/hud/TuningPanel.tsx
"use client";

import { useState } from "react";
import {
  getTuningSnapshot,
  listTuningFields,
  setTuningValue,
  type TuningField,
  type TuningGroup,
} from "@/lib/game/tuning";

interface TuningInputProps {
  field: TuningField;
  value: string;
  onValueChange: (id: string, value: string) => void;
}

interface TuningPanelProps {
  className?: string;
}

/**
 * Renders a compact labeled number input for one tuning field.
 * @param props - The field, draft value, and update callback.
 * @returns Labeled numeric control.
 */
function TuningInput({ field, value, onValueChange }: TuningInputProps) {
  /**
   * Preserves temporary numeric drafts while committing valid values immediately.
   * @param event - The native input change event.
   */
  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onValueChange(field.id, event.currentTarget.value);
  }

  const inputId = `tuning-${field.id}`;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-2">
      <label className="min-w-0 truncate text-xs text-hud-muted" htmlFor={inputId} title={field.label}>
        {field.label}
      </label>
      <input
        autoComplete="off"
        className="w-full rounded border border-hud-border bg-hud-track px-2 py-1 font-mono text-xs tabular-nums text-hud-text outline-none focus:border-hud-accent focus:ring-1 focus:ring-hud-accent"
        id={inputId}
        inputMode="decimal"
        onChange={handleChange}
        step="any"
        type="number"
        value={value}
      />
    </div>
  );
}

/**
 * Development tuning controls for the vehicle, tires, drivetrain, and steering.
 * The parent controls whether this panel is enabled for the current URL/build.
 * @param props - Optional layout classes supplied by the HUD.
 * @returns Scrollable DOM tuning panel.
 */
export function TuningPanel({ className = "" }: TuningPanelProps) {
  const [fields, setFields] = useState<TuningField[]>(() => listTuningFields());
  const [draftValues, setDraftValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.id, String(field.value)])),
  );
  const [copyStatus, setCopyStatus] = useState("");
  const groups = Array.from(new Set(fields.map((field) => field.group)));

  /**
   * Updates a draft and commits finite numeric values to the shared tuning copy.
   * @param id - Stable dotted path for the tuning field.
   * @param rawValue - Input text, which may be an unfinished numeric draft.
   */
  function handleFieldChange(id: string, rawValue: string): void {
    setDraftValues((current) => ({ ...current, [id]: rawValue }));
    const value = rawValue.trim() === "" ? Number.NaN : Number(rawValue);
    if (Number.isFinite(value) && setTuningValue(id, value)) {
      setFields(listTuningFields());
    }
  }

  /**
   * Renders all editable values for one configuration group.
   * @param group - The tuning configuration section to render.
   * @returns A labeled section of number inputs.
   */
  function renderGroup(group: TuningGroup) {
    return (
      <section aria-labelledby={`tuning-group-${group}`} className="space-y-2" key={group}>
        <h3
          className="border-b border-hud-border pb-1 font-mono text-xs font-bold uppercase tracking-widest text-hud-accent"
          id={`tuning-group-${group}`}
        >
          {group}
        </h3>
        <div className="space-y-1.5">
          {fields
            .filter((field) => field.group === group)
            .map((field) => (
              <TuningInput
                field={field}
                key={field.id}
                onValueChange={handleFieldChange}
                value={draftValues[field.id] ?? String(field.value)}
              />
            ))}
        </div>
      </section>
    );
  }

  /**
   * Copies a detached snapshot of the current tuning values as formatted JSON.
   */
  async function copyAsJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(JSON.stringify(getTuningSnapshot(), null, 2));
      setCopyStatus("JSON copied");
    } catch {
      setCopyStatus("Clipboard unavailable");
    }
  }

  return (
    <aside
      aria-label="Vehicle tuning controls"
      className={`pointer-events-auto fixed right-3 top-3 z-30 flex max-h-[min(75vh,42rem)] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-hud-border bg-hud-surface text-hud-text shadow-xl backdrop-blur-md ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-hud-border px-3 py-2">
        <h2 className="font-mono text-sm font-bold uppercase tracking-widest">Tuning</h2>
        <button
          className="shrink-0 rounded border border-hud-border px-2 py-1 text-xs font-semibold text-hud-text transition-colors hover:border-hud-accent hover:text-hud-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hud-accent"
          onClick={copyAsJson}
          type="button"
        >
          Copy as JSON
        </button>
      </header>
      <div className="space-y-3 overflow-y-auto px-3 py-3">
        {groups.map(renderGroup)}
      </div>
      <p aria-live="polite" className="min-h-6 border-t border-hud-border px-3 py-1 text-xs text-hud-muted">
        {copyStatus}
      </p>
    </aside>
  );
}
