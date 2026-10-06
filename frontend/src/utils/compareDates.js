// Compares two dates safely, treating missing/invalid values as "oldest" so
// they sort last regardless of direction, rather than breaking the sort.
export function compareDates(a, b) {
  const timeA = a ? new Date(a).getTime() : NaN;
  const timeB = b ? new Date(b).getTime() : NaN;
  const validA = !Number.isNaN(timeA);
  const validB = !Number.isNaN(timeB);

  if (!validA && !validB) return 0;
  if (!validA) return 1;
  if (!validB) return -1;

  return timeA - timeB;
}
