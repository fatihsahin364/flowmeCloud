import Resolver from '@forge/resolver';
import api, { route, storage } from '@forge/api';

const resolver = new Resolver();

// Central storage key for FlowMe settings to keep reads/writes consistent.
const CONFIG_KEY = 'flowme.config';

const DRAWIO_XML_SUFFIX = '.mxfile';
const DRAWIO_SVG_SUFFIX = '.svg';
const FLOWME_ATTACHMENT_MARKER = 'FlowMe diagram:';

async function getActorInfo() {
  try {
    const me = await api.asUser().requestConfluence(route`/wiki/rest/api/user/current`);
    if (!me.ok) {
      return null;
    }
    const data = await me.json();
    if (!data) return null;
    return {
      accountId: data.accountId || null,
      displayName: data.displayName || data.publicName || null,
    };
  } catch (e) {
    return null;
  }
}

function fixMojibake(value) {
  if (!value || typeof value !== 'string') return value || '';
  if (!/[ÃÅÂ]/.test(value)) return value;
  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    return value;
  }
}

function buildFlowmeComment(diagramName, actor) {
  const base = `${FLOWME_ATTACHMENT_MARKER} ${diagramName}`;
  if (!actor || !actor.displayName) {
    return base;
  }
  const display = actor.displayName ? actor.displayName : '';
  return `${base} | savedBy:${display}`;
}


async function requestConfluenceJson(path, options, mode) {
  const client = mode === 'app' ? api.asApp() : api.asUser();
  const response = await client.requestConfluence(path, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Confluence API error ${response.status}: ${text}`);
  }
  return response.json();
}

async function requestConfluenceText(path, options, mode) {
  const client = mode === 'app' ? api.asApp() : api.asUser();
  const response = await client.requestConfluence(path, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Confluence API error ${response.status}: ${text}`);
  }
  return response.text();
}

async function listAttachmentsV2(pageId, mode) {
  const results = [];
  let cursor = null;
  let pageCount = 0;
  while (true) {
    pageCount += 1;
    if (pageCount > 20) {
      break;
    }
    const path = cursor
      ? route`/wiki/api/v2/pages/${pageId}/attachments?limit=200&cursor=${cursor}`
      : route`/wiki/api/v2/pages/${pageId}/attachments?limit=200`;
    const data = await requestConfluenceJson(path, undefined, mode);
    if (data && Array.isArray(data.results)) {
      results.push(...data.results);
    }
    const nextLink = data && data._links && data._links.next ? String(data._links.next) : '';
    if (!nextLink) break;
    let nextCursor = null;
    try {
      const url = new URL(nextLink, 'https://example.com');
      nextCursor = url.searchParams.get('cursor');
    } catch (e) {
    }
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  return results;
}

async function getAttachmentByName(pageId, filename, mode) {
  const data = await requestConfluenceJson(
    route`/wiki/api/v2/pages/${pageId}/attachments?filename=${filename}&limit=1`,
    undefined,
    mode
  );
  const results = data && data.results ? data.results : [];
  return results.length ? results[0] : null;
}

async function downloadAttachmentByParent(pageId, attachmentId, mode, version) {
  if (version) {
    return requestConfluenceText(
      route`/wiki/rest/api/content/${pageId}/child/attachment/${attachmentId}/download?version=${version}`,
      undefined,
      mode
    );
  }
  return requestConfluenceText(
    route`/wiki/rest/api/content/${pageId}/child/attachment/${attachmentId}/download`,
    undefined,
    mode
  );
}

async function deleteAttachmentById(attachmentId, mode) {
  const client = mode === 'app' ? api.asApp() : api.asUser();
  const response = await client.requestConfluence(
    route`/wiki/api/v2/attachments/${attachmentId}`,
    { method: 'DELETE' }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Confluence API error ${response.status}: ${text}`);
  }
  return true;
}

function getSiteUrlFromRequest(req) {
  const payload = req && req.payload ? req.payload : {};
  if (payload.siteUrl) return String(payload.siteUrl);
  const context = req && req.context ? req.context : {};
  if (context.siteUrl) return String(context.siteUrl);
  if (context.extension && context.extension.siteUrl) {
    return String(context.extension.siteUrl);
  }
  return '';
}


function buildDownloadUrlFromMeta(meta) {
  if (!meta) return '';
  const downloadPath = getDownloadPath(meta);
  if (!downloadPath) return '';
  const base = meta._links && meta._links.base ? meta._links.base : '';
  if (!base) return '';
  if (/^https?:\/\//i.test(downloadPath)) return downloadPath;
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const suffix = downloadPath.startsWith('/') ? downloadPath : `/${downloadPath}`;
  return `${normalizedBase}${suffix}`;
}

function getDownloadPath(attachment) {
  if (!attachment) return '';
  return (
    attachment.downloadLink ||
    (attachment._links && attachment._links.download ? attachment._links.download : '') ||
    ''
  );
}

async function uploadAttachment(pageId, filename, contentType, content, mode, attachmentId, comment) {
  const form = new FormData();
  const blob = new Blob([content], { type: contentType });
  form.append('file', blob, filename);
  if (comment) {
    form.append('comment', new Blob([comment], { type: 'text/plain;charset=utf-8' }));
  }

  const client = mode === 'app' ? api.asApp() : api.asUser();
  const idMatch = attachmentId ? String(attachmentId).match(/\d+/) : null;
  const normalizedId = idMatch ? idMatch[0] : '';
  if (normalizedId) {
    form.append('id', normalizedId);
  }
  const uploadRoute = normalizedId
    ? route`/wiki/rest/api/content/${pageId}/child/attachment?id=${normalizedId}`
    : route`/wiki/rest/api/content/${pageId}/child/attachment`;
  const requestMeta = {
    method: 'POST',
    url: normalizedId
      ? `/wiki/rest/api/content/${pageId}/child/attachment?id=${normalizedId}`
      : `/wiki/rest/api/content/${pageId}/child/attachment`,
    filename,
    contentType,
    contentSize: content ? String(content).length : 0,
    attachmentId: attachmentId || null,
    normalizedId: normalizedId || null,
    updateMode: Boolean(normalizedId),
  };
  const response = await client.requestConfluence(
    uploadRoute,
    {
      method: 'POST',
      headers: {
        'X-Atlassian-Token': 'no-check',
      },
      body: form,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    if (normalizedId && text.includes('same file name')) {
      const retry = await client.requestConfluence(
        uploadRoute,
        {
          method: 'PUT',
          headers: {
            'X-Atlassian-Token': 'no-check',
          },
          body: form,
        }
      );
      if (retry.ok) {
        return retry.json();
      }
      const retryText = await retry.text();
      throw new Error(
        `Attachment upload retry failed ${retry.status}: ${retryText}`
      );
    }
    const auth = response.headers.get('www-authenticate') || '';
    const details = auth ? ` | www-authenticate: ${auth}` : '';
    console.log('FlowMe attachment upload failed', requestMeta);
    throw new Error(
      `Attachment upload failed ${response.status}: ${text}${details} | request: ${JSON.stringify(
        requestMeta
      )}`
    );
  }
  return response.json();
}

function decodeHtmlEntities(value) {
  if (!value) return '';
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function hasDraftForPage(pageId) {
  try {
    const response = await api
      .asApp()
      .requestConfluence(route`/wiki/rest/api/content/${pageId}?status=draft&expand=body.storage`);
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function extractDiagramNameFromParams(params) {
  if (!params || typeof params !== 'object') return '';
  let name = params.diagramName;
  if (name && typeof name === 'object' && name.value) {
    name = name.value;
  }
  if (!name && params.config && params.config.diagramName) {
    name = params.config.diagramName;
  }
  if (name && typeof name === 'object' && name.value) {
    name = name.value;
  }
  return name ? String(name).trim() : '';
}

function findStringValueByKey(root, key, depth = 0) {
  if (!root || typeof root !== 'object' || depth > 12) return '';
  if (Object.prototype.hasOwnProperty.call(root, key)) {
    const value = root[key];
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object' && typeof value.value === 'string') {
      return value.value;
    }
  }
  if (Array.isArray(root)) {
    for (const item of root) {
      const found = findStringValueByKey(item, key, depth + 1);
      if (found) return found;
    }
    return '';
  }
  for (const childKey of Object.keys(root)) {
    const found = findStringValueByKey(root[childKey], key, depth + 1);
    if (found) return found;
  }
  return '';
}

function scanAdfForFlowmeMacros(adf) {
  const names = new Set();
  let hasMacro = false;
  const extensions = [];
  const rawFlowmeNodes = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') {
      return;
    }
    const type = value.type;
    if (type === 'extension' || type === 'inlineExtension' || type === 'bodiedExtension') {
      const attrs = value.attrs || {};
      const extensionKey = attrs.extensionKey || attrs.extensionId || attrs.key || '';
      const extensionType = attrs.extensionType || '';
      const isFlowmeMacro =
        extensionKey === 'flowmecloud-diagram' ||
        extensionKey.endsWith('/flowmecloud-diagram') ||
        extensionKey.endsWith(':flowmecloud-diagram');
      if (isFlowmeMacro) {
        hasMacro = true;
        if (rawFlowmeNodes.length < 10) {
          rawFlowmeNodes.push({
            type,
            attrs,
            parameters: attrs.parameters || null,
          });
        }
        const params = attrs.parameters || {};
        const macroParams = params.macroParams || params.config || params.macroConfig || {};
        let name = extractDiagramNameFromParams(macroParams);
        if (!name) {
          name = findStringValueByKey(attrs, 'diagramName');
        }
        if (!name) {
          name = findStringValueByKey(params, 'diagramName');
        }
        if (name) names.add(name);
      }
      if (extensions.length < 25) {
        const params = attrs.parameters || {};
        const macroParams = params.macroParams || params.config || params.macroConfig || {};
        extensions.push({
          extensionKey,
          extensionType,
          hasMacroParams: Boolean(
            params.macroParams || params.config || params.macroConfig
          ),
          diagramName:
            extractDiagramNameFromParams(macroParams) ||
            findStringValueByKey(attrs, 'diagramName') ||
            findStringValueByKey(params, 'diagramName'),
        });
      }
    }
    Object.keys(value).forEach((key) => visit(value[key]));
  };
  visit(adf);
  return { names, hasMacro, extensions, rawFlowmeNodes };
}

async function getFlowmeDiagramNamesFromPage(pageId) {
  const names = new Set();
  let hasMacro = false;
  let scanOk = false;
  let storageData = null;
  try {
    storageData = await requestConfluenceJson(
      route`/wiki/api/v2/pages/${pageId}?body-format=storage`,
      undefined,
      'app'
    );
    scanOk = true;
  } catch (e) {
    // ignore storage read failure
  }

  if (storageData) {
    let html = '';
    if (storageData && storageData.body && storageData.body.storage && storageData.body.storage.value) {
      html = String(storageData.body.storage.value);
    } else if (storageData && storageData.body && storageData.body.value) {
      html = String(storageData.body.value);
    }
    if (html) {
      const macroRegex = /<ac:structured-macro[^>]*ac:name="flowmecloud-diagram"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi;
      let match;
      while ((match = macroRegex.exec(html))) {
        hasMacro = true;
        const block = match[1];
        const paramRegex = /<ac:parameter[^>]*ac:name="diagramName"[^>]*>([\s\S]*?)<\/ac:parameter>/i;
        const paramMatch = paramRegex.exec(block);
        if (paramMatch && paramMatch[1]) {
          const decoded = decodeHtmlEntities(paramMatch[1].trim());
          if (decoded) names.add(decoded);
        }
      }
    }
  }

  let adfData = null;
  try {
    adfData = await requestConfluenceJson(
      route`/wiki/api/v2/pages/${pageId}?body-format=atlas_doc_format`,
      undefined,
      'app'
    );
    scanOk = true;
  } catch (e) {
    // ignore adf read failure
  }

  if (adfData) {
    let adf = null;
    const raw =
      (adfData.body && adfData.body.atlas_doc_format && adfData.body.atlas_doc_format.value) ||
      (adfData.body && adfData.body.atlas_doc_format) ||
      (adfData.body && adfData.body.value) ||
      null;
    if (raw) {
      try {
        adf = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        adf = null;
      }
    }
    if (adf) {
      const adfResult = scanAdfForFlowmeMacros(adf);
      adfResult.names.forEach((name) => names.add(name));
      if (adfResult.hasMacro) hasMacro = true;
    }
  }

  return { names, hasMacro, scanOk };
}

async function cleanupOrphanAttachments(pageId) {
  const attachments = await listAttachmentsV2(pageId, 'app');
  const flowmeCandidates = attachments.filter((attachment) => {
    const title = attachment && attachment.title ? String(attachment.title) : '';
    const comment = attachment && attachment.comment ? String(attachment.comment) : '';
    if (!title || !comment.startsWith(FLOWME_ATTACHMENT_MARKER)) return false;
    if (title.endsWith(DRAWIO_XML_SUFFIX) || title.endsWith(DRAWIO_SVG_SUFFIX)) {
      return true;
    }
    return false;
  });
  if (flowmeCandidates.length === 0) {
    return { deleted: 0, kept: 0, total: attachments.length, candidates: 0 };
  }

  const { names: keepNames, hasMacro, scanOk } = await getFlowmeDiagramNamesFromPage(pageId);
  if (!scanOk) {
    return { deleted: 0, kept: 0, total: 0, candidates: 0 };
  }
  if (!hasMacro) {
    const hasDraft = await hasDraftForPage(pageId);
    if (hasDraft) {
      return { deleted: 0, kept: 0, total: 0, candidates: 0 };
    }
  }
  if (hasMacro && keepNames.size === 0) {
    return { deleted: 0, kept: 0, total: 0, candidates: 0 };
  }
  // Reuse the filtered attachment list to avoid a second fetch.
  let candidates = 0;
  let deleted = 0;
  let kept = 0;
  for (const attachment of flowmeCandidates) {
    const title = attachment && attachment.title ? String(attachment.title) : '';
    const comment = attachment && attachment.comment ? String(attachment.comment) : '';
    if (!title || !comment.startsWith(FLOWME_ATTACHMENT_MARKER)) continue;
    const isXml = title.endsWith(DRAWIO_XML_SUFFIX);
    const isSvg = title.endsWith(DRAWIO_SVG_SUFFIX);
    if (!isXml && !isSvg) continue;
    const diagramName = title.replace(DRAWIO_XML_SUFFIX, '').replace(DRAWIO_SVG_SUFFIX, '');
    candidates += 1;
    if (keepNames.has(diagramName)) {
      kept += 1;
      continue;
    }
    if (hasMacro && keepNames.size > 0) {
      // Macros exist but this diagram name isn't referenced anymore.
    }
    if (attachment.id) {
      await deleteAttachmentById(String(attachment.id), 'app');
      deleted += 1;
    }
  }
  console.log('FlowMe cleanup done', { pageId, deleted, kept, total: attachments.length, candidates });
  return { deleted, kept, total: attachments.length, candidates };
}

resolver.define('getText', (req) => {
  // Simple placeholder resolver so the macro UI still has a working bridge call.
  console.log(req);
  return 'Hello, world!';
});

resolver.define('getConfig', async () => {
  // Return persisted configuration for Custom UI consumers (macro/editor).
  const stored = await storage.get(CONFIG_KEY);
  return stored || null;
});

resolver.define('setConfig', async (req) => {
  // Persist configuration from Custom UI.
  const incoming = req && req.payload ? req.payload : null;
  if (!incoming || typeof incoming !== 'object') {
    return { ok: false, error: 'Invalid configuration payload.' };
  }
  const existing = (await storage.get(CONFIG_KEY)) || {};
  const next = { ...existing, ...incoming };
  if (!incoming.secretValue && existing.secretValue) {
    next.secretValue = existing.secretValue;
  }
  await storage.set(CONFIG_KEY, next);
  return { ok: true };
});

resolver.define('listDiagrams', async (req) => {
  try {
    const payload = req && req.payload ? req.payload : {};
    const pageId = payload.pageId ? String(payload.pageId) : '';
    if (!pageId) {
      return { ok: false, error: 'Missing pageId.', names: [] };
    }
    const attachments = await listAttachmentsV2(pageId, 'app');
    const names = new Set();
    attachments.forEach((attachment) => {
      const title = attachment && attachment.title ? String(attachment.title) : '';
      if (title.endsWith(DRAWIO_XML_SUFFIX)) {
        names.add(title.slice(0, -DRAWIO_XML_SUFFIX.length));
      }
    });
    return { ok: true, names: Array.from(names).sort() };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Failed to list diagrams.' };
  }
});

resolver.define('loadDiagram', async (req) => {
  try {
    const payload = req && req.payload ? req.payload : {};
    const pageId = payload.pageId ? String(payload.pageId) : '';
    const diagramName = payload.diagramName ? String(payload.diagramName) : '';
    const version = payload.version ? String(payload.version) : '';
    if (!pageId || !diagramName) {
      return { ok: false, error: 'Missing pageId or diagramName.' };
    }
    const xmlName = `${diagramName}${DRAWIO_XML_SUFFIX}`;
    const svgName = `${diagramName}${DRAWIO_SVG_SUFFIX}`;

    const xmlMeta = await getAttachmentByName(pageId, xmlName, 'app');
    const svgMeta = await getAttachmentByName(pageId, svgName, 'app');

    let xml = '';
    let svg = '';
    let svgVersion = null;

    if (xmlMeta && xmlMeta.id) {
      const xmlPageId = xmlMeta.pageId ? String(xmlMeta.pageId) : pageId;
      xml = await downloadAttachmentByParent(xmlPageId, String(xmlMeta.id), 'app', version);
    }
    if (svgMeta && svgMeta.id) {
      const svgPageId = svgMeta.pageId ? String(svgMeta.pageId) : pageId;
      svg = await downloadAttachmentByParent(svgPageId, String(svgMeta.id), 'app', version);
      if (version) {
        svgVersion = Number(version);
      } else if (svgMeta.version && typeof svgMeta.version.number === 'number') {
        svgVersion = svgMeta.version.number;
      }
    }
    return {
      ok: true,
      xml,
      svg,
      hasXml: Boolean(xml),
      hasSvg: Boolean(svg),
      svgVersion,
    };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Failed to load diagram.' };
  }
});

resolver.define('saveDiagram', async (req) => {
  try {
    const payload = req && req.payload ? req.payload : {};
    const pageId = payload.pageId ? String(payload.pageId) : '';
    const diagramName = payload.diagramName ? String(payload.diagramName) : '';
    const xml = typeof payload.xml === 'string' ? payload.xml : '';
    const svg = typeof payload.svg === 'string' ? payload.svg : '';
    const createOnly = Boolean(payload.createOnly);

    if (!pageId || !diagramName) {
      return { ok: false, error: 'Missing pageId or diagramName.' };
    }
    if (!xml && !svg) {
      return { ok: false, error: 'No diagram content provided.' };
    }

    const actor = await getActorInfo();

    const [existingXml, existingSvg] = await Promise.all([
      xml
        ? getAttachmentByName(pageId, `${diagramName}${DRAWIO_XML_SUFFIX}`, 'app')
        : Promise.resolve(null),
      svg
        ? getAttachmentByName(pageId, `${diagramName}${DRAWIO_SVG_SUFFIX}`, 'app')
        : Promise.resolve(null),
    ]);

    if (createOnly && (existingXml || existingSvg)) {
      return { ok: false, error: 'Diagram already exists.', status: 409 };
    }

    const uploads = [];
    if (xml) {
      uploads.push(
        uploadAttachment(
          pageId,
          `${diagramName}${DRAWIO_XML_SUFFIX}`,
          'application/xml',
          xml,
          'app',
          existingXml && existingXml.id ? String(existingXml.id) : undefined,
          buildFlowmeComment(diagramName, actor)
        )
      );
    }
    if (svg) {
      uploads.push(
        uploadAttachment(
          pageId,
          `${diagramName}${DRAWIO_SVG_SUFFIX}`,
          'image/svg+xml',
          svg,
          'app',
          existingSvg && existingSvg.id ? String(existingSvg.id) : undefined,
          buildFlowmeComment(diagramName, actor)
        )
      );
    }

    if (uploads.length) {
      await Promise.all(uploads);
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : 'Failed to save diagram.' };
  }
});

resolver.define('listDiagramVersions', async (req) => {
  try {
    const payload = req && req.payload ? req.payload : {};
    const pageId = payload.pageId ? String(payload.pageId) : '';
    const diagramName = payload.diagramName ? String(payload.diagramName) : '';
    if (!pageId || !diagramName) {
      return { ok: false, error: 'Missing pageId or diagramName.' };
    }

    const xmlMeta = await getAttachmentByName(
      pageId,
      `${diagramName}${DRAWIO_XML_SUFFIX}`,
      'app'
    );
    const svgMeta = await getAttachmentByName(
      pageId,
      `${diagramName}${DRAWIO_SVG_SUFFIX}`,
      'app'
    );
    const attachmentId = (xmlMeta && xmlMeta.id) || (svgMeta && svgMeta.id) || '';
    if (!attachmentId) {
      console.log('FlowMe list versions no attachment', { pageId, diagramName });
      return { ok: true, versions: [] };
    }

    const data = await requestConfluenceJson(
      route`/wiki/api/v2/attachments/${attachmentId}/versions?limit=50`,
      undefined,
      'app'
    );
    const results = data && Array.isArray(data.results) ? data.results : [];
    const authorIds = new Set();
    const rawVersions = results
      .map((item) => {
        const author =
          (item && item.createdBy) ||
          (item && item.by) ||
          (item && item.author) ||
          (item && item.user) ||
          null;
        const authorId =
          (author && author.accountId) ||
          (item && item.authorId) ||
          (item && item.userId) ||
          null;
        const displayName =
          (author && author.displayName) ||
          (author && author.publicName) ||
          null;
        const comment =
          (item && item.message) ||
          (item && item.comment) ||
          (item && item.version && item.version.message) ||
          '';
        let savedBy = '';
        if (comment) {
          const match = String(comment).match(/savedBy:([^|]+)/i);
          if (match && match[1]) {
            savedBy = fixMojibake(match[1].trim());
          }
        }
        if (!displayName && authorId) {
          authorIds.add(String(authorId));
        }
        return {
          number: item && item.number ? item.number : null,
          when: item && (item.createdAt || item.when) ? item.createdAt || item.when : null,
          by: savedBy || displayName,
          authorId: authorId ? String(authorId) : null,
        };
      })
      .filter((item) => item.number !== null);

    const authorMap = new Map();
    if (authorIds.size) {
      const lookups = Array.from(authorIds).map(async (accountId) => {
        try {
          const user = await requestConfluenceJson(
            route`/wiki/rest/api/user?accountId=${accountId}`,
            undefined,
            'app'
          );
          if (user && user.displayName) {
            authorMap.set(accountId, user.displayName);
          }
        } catch (e) {
          // ignore lookup failures
        }
      });
      await Promise.all(lookups);
    }

    const versions = rawVersions.map((item) => ({
      number: item.number,
      when: item.when,
      by: item.by || (item.authorId ? authorMap.get(item.authorId) || '' : ''),
    }));

    console.log('FlowMe list versions ok', { pageId, diagramName, count: versions.length });
    return { ok: true, versions };
  } catch (e) {
    console.log('FlowMe list versions failed', e && e.message ? e.message : e);
    return { ok: false, error: e && e.message ? e.message : 'Failed to list versions.' };
  }
});

function extractPageIdFromEvent(event) {
  if (!event || typeof event !== 'object') return '';
  return (
    event.contentId ||
    (event.content && event.content.id) ||
    (event.page && event.page.id) ||
    event.objectId ||
    event.id ||
    ''
  );
}

export async function pageUpdatedHandler(event) {
  try {
    const pageId = extractPageIdFromEvent(event);
    if (!pageId) {
      console.log('FlowMe pageUpdatedHandler missing pageId', {
        keys: event ? Object.keys(event) : null,
        event,
      });
      return;
    }
    const updateTrigger =
      (event && event.updateTrigger) ||
      (event && event.context && event.context.updateTrigger) ||
      '';
    const eventType = (event && event.eventType) || '';
    console.log('FlowMe pageUpdatedHandler running', {
      pageId,
      eventType,
      updateTrigger,
      eventKeys: event ? Object.keys(event) : [],
    });
    let allowCleanup = false;
    if (!updateTrigger || updateTrigger === 'user') {
      allowCleanup = true;
    } else if (updateTrigger === 'edit_page') {
      const hasDraft = await hasDraftForPage(pageId);
      console.log('FlowMe pageUpdatedHandler edit_page draft check', {
        pageId,
        hasDraft,
      });
      if (!hasDraft) {
        allowCleanup = true;
      }
    }
    if (!allowCleanup) {
      console.log('FlowMe pageUpdatedHandler skipped: updateTrigger', {
        pageId,
        eventType,
        updateTrigger,
      });
      return;
    }
    await cleanupOrphanAttachments(String(pageId));
  } catch (e) {
    console.log('FlowMe pageUpdatedHandler failed', e && e.message ? e.message : e);
  }
}

export const handler = resolver.getDefinitions();
