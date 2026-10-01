// app/loading.tsx
import { LoadingScreen } from "@/components/game/overlays/LoadingScreen";

/**
 * Route-level loading state while the page resolves its seed.
 * @returns Loading screen.
 */
export default function Loading() {
  return <LoadingScreen message="Preparing rally" />;
}
