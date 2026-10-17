/**
 * Lightweight `cn` utility — merges class names without adding a dependency.
 * For Phase 1 this is sufficient; switch to clsx/tailwind-merge if needed later.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
