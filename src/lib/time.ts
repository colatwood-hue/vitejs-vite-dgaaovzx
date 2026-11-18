/** Current time in ms. Server components call this per request. */
export function nowMs(): number {
  return Date.now();
}
