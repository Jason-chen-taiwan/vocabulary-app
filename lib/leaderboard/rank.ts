export function rankFromCountAbove(countAbove: number): number {
  return countAbove + 1
}
export function displayNameOf(u: { displayName?: string | null; name?: string | null }): string {
  return u.displayName ?? u.name ?? '匿名'
}
