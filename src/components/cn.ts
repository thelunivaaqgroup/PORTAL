/**
 * Minimal className merge utility.
 * Filters out falsy values and joins with a space.
 * No external deps — replace with clsx/twMerge later if needed.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
