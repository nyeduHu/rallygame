// components/lobby/MainMenu.tsx
"use client";

interface MainMenuProps {
  onCreate: () => void;
  onJoin: () => void;
}

/** Simple landing menu for the room-based multiplayer flow. */
export function MainMenu({ onCreate, onJoin }: MainMenuProps) {
  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-white/20 bg-slate-900/80 p-6 text-white shadow-xl">
      <h1 className="mb-4 text-3xl font-semibold">Rally lobby</h1>
      <div className="flex flex-col gap-3">
        <button type="button" className="rounded bg-emerald-500 px-4 py-3 font-medium text-slate-950" onClick={onCreate}>
          CREATE RALLY
        </button>
        <button type="button" className="rounded bg-slate-700 px-4 py-3 font-medium text-white" onClick={onJoin}>
          JOIN RALLY
        </button>
      </div>
    </section>
  );
}
