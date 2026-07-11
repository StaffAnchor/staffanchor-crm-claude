// Tiny classnames joiner -- no new dependency needed for a codebase that
// already hand-writes conditional className template strings everywhere.
// Falsy values (false/null/undefined/"") are dropped.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
