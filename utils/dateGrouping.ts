/**
 * Date grouping utilities for search results
 */

/**
 * Returns a date label: "Today", "Yesterday", or formatted date like "Jan 5"
 */
export function getDateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // Reset to start of day for comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateStart.getTime() === today.getTime()) {
    return 'Today';
  } else if (dateStart.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  } else {
    // Format as "Jan 5" or "Dec 28"
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/**
 * Groups items by date label, maintaining insertion order
 */
export function groupByDate<T>(
  items: T[],
  getTimestamp: (item: T) => number
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const label = getDateLabel(getTimestamp(item));
    const existing = groups.get(label) || [];
    existing.push(item);
    groups.set(label, existing);
  }

  return groups;
}
