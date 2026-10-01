// components/lobby/JoinForm.tsx
"use client";

interface JoinFormProps {
  onSubmit: (roomCode: string, name: string) => void;
}

/** Minimal form for joining a room via a code and a player name. */
export function JoinForm({ onSubmit }: JoinFormProps) {
  return (
    <form
      className="mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-white/20 bg-slate-900/80 p-6 text-white"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const roomCode = (form.elements.namedItem("roomCode") as HTMLInputElement | null)?.value ?? "";
        const name = (form.elements.namedItem("name") as HTMLInputElement | null)?.value ?? "";
        onSubmit(roomCode, name);
      }}
    >
      <label className="flex flex-col gap-1">
        <span>Room code</span>
        <input name="roomCode" className="rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white" placeholder="ABCD12" />
      </label>
      <label className="flex flex-col gap-1">
        <span>Name</span>
        <input name="name" className="rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white" placeholder="Driver" />
      </label>
      <button type="submit" className="rounded bg-cyan-500 px-4 py-3 font-medium text-slate-950">
        JOIN ROOM
      </button>
    </form>
  );
}
