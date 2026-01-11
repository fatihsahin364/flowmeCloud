export const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
export const DRAWIO_URL = `${DRAWIO_ORIGIN}/?embed=1&proto=json&spin=1&ui=min&saveAndExit=1`;

function decodeBase64(data) {
  try {
    return atob(data);
  } catch (e) {
    return '';
  }
}

export function extractSvgFromExport(message) {
  if (!message) return null;
  const raw = message.data || message.svg || message.xml;
  if (!raw) return null;
  if (raw.startsWith('<svg')) return raw;
  if (raw.startsWith('data:image/svg+xml;base64,')) {
    return decodeBase64(raw.replace('data:image/svg+xml;base64,', ''));
  }
  if (raw.startsWith('data:image/svg+xml;utf8,')) {
    return decodeURIComponent(raw.replace('data:image/svg+xml;utf8,', ''));
  }
  return null;
}

export function extractXmlFromExport(message) {
  if (!message) return null;
  const raw = message.data || message.xml;
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('<')) return raw;
  if (raw.startsWith('data:')) {
    const marker = 'base64,';
    const idx = raw.indexOf(marker);
    if (idx !== -1) {
      const decoded = decodeBase64(raw.slice(idx + marker.length));
      if (decoded) return decoded;
    }
  }
  const decoded = decodeBase64(raw);
  if (decoded && decoded.indexOf('<mxfile') !== -1) return decoded;
  return raw;
}
