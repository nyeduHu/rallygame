// components/ui/HudButton.tsx
import type { ButtonHTMLAttributes } from "react";

type HudButtonVariant = "primary" | "secondary";

interface HudButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: HudButtonVariant;
}

const BASE_CLASSES =
  "rounded-md px-5 py-2.5 font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hud-accent disabled:opacity-50";

const VARIANT_CLASSES: Record<HudButtonVariant, string> = {
  primary: "bg-hud-accent text-stage-bg hover:bg-hud-text",
  secondary: "border border-hud-border bg-hud-surface text-hud-text hover:border-hud-accent",
};

/**
 * Shared button for overlays and error screens.
 * @param props - Native button props plus a visual variant.
 * @returns Button element.
 */
export function HudButton({ variant = "primary", className = "", type = "button", ...rest }: HudButtonProps) {
  return <button type={type} className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`} {...rest} />;
}
