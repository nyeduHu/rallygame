// lib/game/weather/runtime.ts
/** Per-frame windshield values shared by the weather driver, glass shader and wiper blades. */
export const windshieldRuntime = {
  dirt: 0,
  /** Blade sweep phase in 0..1; advances only while the wipers run. */
  wipePhase: 0,
};
