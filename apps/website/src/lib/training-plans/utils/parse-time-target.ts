/**
 * Parse time target string (e.g., "4h30", "3h", "1h15") to seconds
 * @param timeStr - Time string in format like "4h30", "3h", "1h15", "45min"
 * @returns Time in seconds, or null if invalid
 */
export function parseTimeTarget(timeStr: string): number | null {
  // Remove spaces and convert to lowercase
  const cleaned = timeStr.trim().toLowerCase();

  // Match patterns like "4h30", "3h", "1h15", "45min", "30m"
  const hourMinMatch = cleaned.match(/^(\d+)h(?:(\d+)m?)?$/);
  if (hourMinMatch) {
    const hours = parseInt(hourMinMatch[1], 10);
    const minutes = hourMinMatch[2] ? parseInt(hourMinMatch[2], 10) : 0;
    return hours * 3600 + minutes * 60;
  }

  // Match patterns like "45min", "30m"
  const minMatch = cleaned.match(/^(\d+)m(?:in)?$/);
  if (minMatch) {
    const minutes = parseInt(minMatch[1], 10);
    return minutes * 60;
  }

  // Try parsing as pure number (assume seconds)
  const numMatch = cleaned.match(/^(\d+)$/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }

  return null;
}

/**
 * Format seconds to time string (e.g., 16200 -> "4h30", 14400 -> "4h")
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export function formatTimeTarget(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h${String(minutes).padStart(2, '0')}`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}min`;
  } else {
    return `${seconds}s`;
  }
}
