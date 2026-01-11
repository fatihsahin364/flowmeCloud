export function getModuleKey(context) {
  if (context && context.moduleKey) return context.moduleKey;
  if (context && context.extension && context.extension.moduleKey) {
    return context.extension.moduleKey;
  }
  return '';
}

export function getPageId(context) {
  if (context && context.contentId) return String(context.contentId);
  if (context && context.extension && context.extension.contentId) {
    return String(context.extension.contentId);
  }
  if (context && context.extension && context.extension.content && context.extension.content.id) {
    return String(context.extension.content.id);
  }
  return '';
}

export function getSiteUrl(context) {
  if (context && context.siteUrl) return String(context.siteUrl);
  if (context && context.extension && context.extension.siteUrl) {
    return String(context.extension.siteUrl);
  }
  return '';
}

export function detectMacroConfigContext(context, moduleKey) {
  const ext = context && context.extension ? context.extension : {};
  if (ext.macro && ext.macro.isConfiguring === true) return true;
  if (ext.macro && ext.macro.isInserting === true) return true;
  if (ext.isConfig === true) return true;
  if (ext.type && String(ext.type).toLowerCase().includes('config')) return true;
  if (ext.location && String(ext.location).toLowerCase().includes('config')) return true;
  if (ext.renderMode && String(ext.renderMode).toLowerCase() === 'config') return true;
  if (ext.mode && String(ext.mode).toLowerCase() === 'config') return true;
  if (ext.context && String(ext.context).toLowerCase().includes('config')) return true;
  try {
    const path = window.location.pathname || '';
    const search = window.location.search || '';
    if (/macro-config|macroConfig|config/i.test(path)) return true;
    if (/macro-config|macroConfig|config/i.test(search)) return true;
  } catch (e) {
    // ignore
  }
  if (moduleKey && moduleKey === 'flowmecloud-diagram' && ext.isConfig !== false && ext.renderMode) {
    return String(ext.renderMode).toLowerCase().includes('config');
  }
  return false;
}

export function isEditingContext(context) {
  if (!context) return false;
  const ext = context.extension || {};
  const candidates = [
    context.mode,
    ext.mode,
    ext.renderMode,
    ext.editMode,
    ext.isEditing,
  ];
  for (const value of candidates) {
    if (value === true) return true;
    if (typeof value === 'string' && value.toLowerCase() === 'edit') return true;
  }
  try {
    const path = window.location.pathname || '';
    if (path.includes('/edit') || path.includes('/edit-v2')) {
      return true;
    }
  } catch (e) {
    // ignore
  }
  return false;
}

export function getDiagramConfigFromContext(context) {
  if (!context) return null;
  const ext = context.extension || {};
  return (
    ext.config ||
    (ext.macro && ext.macro.config) ||
    (ext.macro && ext.macro.parameters) ||
    context.config ||
    null
  );
}

export function getModalContext(context) {
  if (!context) return null;
  const extension = context.extension || {};
  const candidates = [
    context.modal && context.modal.context ? context.modal.context : null,
    context.modal || null,
    extension.modal && extension.modal.context ? extension.modal.context : null,
    extension.modal || null,
    extension.modalContext || null,
    extension.context || null,
    context.modalContext || null,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (candidate.mode || candidate.pageId || candidate.diagramName) {
      return candidate;
    }
  }
  return null;
}
