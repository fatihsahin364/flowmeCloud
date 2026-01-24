export const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
// Match the Data Center embed experience: show sidebars + full menus instead of the minimal UI.
const DRAWIO_QUERY =
  'embed=1&proto=json&spin=1&ui=sidebar&sidebar=1&format=1&lang=en&libs=basic%3Bflowchart%3Bbpmn2%3Bgeneral%3Buml&saveAndExit=1';
export const DRAWIO_URL = `${DRAWIO_ORIGIN}/?${DRAWIO_QUERY}`;

function decodeBase64(data) {
  try {
    const binary = atob(data);
    // draw.io exports UTF-8 in base64; decode bytes to avoid mojibake for symbols like Δ.
    if (typeof TextDecoder !== 'undefined') {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    }
    return binary;
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
