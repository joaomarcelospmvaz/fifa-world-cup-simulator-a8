// Lightweight replacement for clsx + tailwind-merge used in this project.
// This function concatenates class names, flattens arrays, filters falsy
// values, and deduplicates exact class tokens keeping the last occurrence.
export function cn(...inputs: any[]) {
  const tokens: string[] = inputs
    .flat(Infinity)
    .filter(Boolean)
    .map((v: any) => String(v).trim())
    .join(' ')
    .split(/\s+/)

  const map = new Map<string, string>()
  for (const t of tokens) {
    // Keep the last occurrence: if already present, remove then set again
    if (map.has(t)) map.delete(t)
    map.set(t, t)
  }

  return Array.from(map.values()).join(' ')
}
