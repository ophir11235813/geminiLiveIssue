// Every context document (and "today", for the system prompt) is formatted
// in a single fixed timezone so date/weekday references are unambiguous to
// Claude. Without this, the server's own timezone (often UTC on a host like
// Railway) would make "shared Wednesday" wrong for a family actually in
// Lafayette, CA, where "Wednesday" means Pacific time, not UTC.
const TIMEZONE = process.env.SCHOOL_TIMEZONE || 'America/Los_Angeles';

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

// e.g. "Wednesday, June 11, 2025, 3:45 PM" — used for each context
// document's own "shared" timestamp, which only changes when a document is
// added/edited, so full precision doesn't cost anything.
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return dateTimeFormatter.format(d);
}

// e.g. "Wednesday, June 11, 2025" — day precision only, used for "today's
// date" in the system prompt. That text sits in front of Anthropic's prompt
// cache breakpoint, so anything finer than a day would bust the cache on
// almost every message (most people don't send two messages within the same
// minute) for a precision this feature doesn't actually need — resolving
// "this Friday" only needs to know what day it is, not what time.
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return dateFormatter.format(d);
}
