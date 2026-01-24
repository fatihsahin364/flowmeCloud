export function mapPermissionError(raw) {
  const message = raw && raw.message ? String(raw.message) : String(raw || '');
  const lower = message.toLowerCase();
  if (
    lower.includes('forbidden') ||
    lower.includes('unauthorized') ||
    lower.includes('not permitted') ||
    lower.includes('permission') ||
    lower.includes('access denied') ||
    lower.includes('status 401') ||
    lower.includes('status 403')
  ) {
    return 'You do not have permission to view or edit diagrams on this page.';
  }
  return message;
}
