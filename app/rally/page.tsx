// app/rally/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NET } from "@/lib/net/netConstants";

/**
 * Online lobby entry: create a rally, or join one with a room code.
 * @returns Menu with the two actions and a link back to the solo game.
 */
export default function RallyMenuPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = code.length === NET.ROOM_CODE_LENGTH;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
      <section className="w-full max-w-md space-y-6 rounded-2xl border border-white/20 bg-slate-900/80 p-6 shadow-xl">
        <h1 className="text-3xl font-semibold">Rally lobby</h1>
        <Link
          href="/rally/new"
          className="block rounded bg-emerald-500 px-4 py-3 text-center font-medium text-slate-950"
        >
          CREATE RALLY
        </Link>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid) router.push(`/rally/${code}`);
          }}
        >
          <label className="flex flex-col gap-1">
            <span>Room code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, NET.ROOM_CODE_LENGTH))}
              placeholder="ABC123"
              autoCapitalize="characters"
              className="rounded border border-slate-600 bg-slate-950 px-3 py-2 font-mono tracking-widest"
            />
          </label>
          <button
            type="submit"
            disabled={!valid}
            className="w-full rounded bg-cyan-500 px-4 py-3 font-medium text-slate-950 disabled:opacity-50"
          >
            JOIN RALLY
          </button>
        </form>
        <Link href="/" className="block text-center text-sm text-slate-400 underline">
          Back to solo practice
        </Link>
      </section>
    </main>
  );
}
