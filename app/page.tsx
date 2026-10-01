// app/page.tsx
import { redirect } from "next/navigation";
import { RallyGameLoader } from "@/components/game/RallyGameLoader";
import { parseSeed, randomSeed } from "@/lib/game/random";
import { parseRole } from "@/lib/game/roles";

/**
 * Stage page. The seed always lives in the URL (?seed=847291) so a stage can be
 * shared and replayed; a missing or invalid seed redirects to a fresh one.
 * @param props - Page props with search params.
 * @returns The game for the requested seed.
 */
export default async function Page({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const seed = parseSeed(params.seed);
  const role = parseRole(params.role) ?? "driver";
  const solo = process.env.NODE_ENV === "development" && params.solo === "1";
  if (seed === null) redirect(`/?seed=${randomSeed()}`);

  return (
    <main className="relative h-full w-full overflow-hidden">
      <h1 className="sr-only">Rally stage {seed}</h1>
      <RallyGameLoader seed={seed} role={role} solo={solo} />
    </main>
  );
}
