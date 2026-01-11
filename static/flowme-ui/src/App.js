import React, { useEffect, useMemo, useState } from 'react';
import { view } from '@forge/bridge';
import AdminSettings from './admin/AdminSettings';
import MacroConfig from './macro/MacroConfig';
import MacroView from './macro/MacroView';
import EditorModal from './macro/EditorModal';
import './flowme.css';
import {
  detectMacroConfigContext,
  getDiagramConfigFromContext,
  getModalContext,
  getModuleKey,
  getPageId,
  getSiteUrl,
  isEditingContext,
} from './lib/context';

const BUILD_TAG = 'ui-build-15';
const DEFAULT_DIAGRAM = {
  diagramName: 'diagram-1',
  width: '',
  border: false,
};

function mergeDiagramConfig(base, overrides) {
  if (!overrides) return base;
  return {
    ...base,
    diagramName: overrides.diagramName ? String(overrides.diagramName) : base.diagramName,
    width: overrides.width ? String(overrides.width) : base.width,
    border: typeof overrides.border === 'boolean' ? Boolean(overrides.border) : base.border,
  };
}

export default function App() {
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const ctx = await view.getContext();
        console.log('FlowMe', BUILD_TAG, 'context', ctx);
        console.log('FlowMe', BUILD_TAG, 'context extension', ctx ? ctx.extension : null);
        console.log('FlowMe', BUILD_TAG, 'context extension.macro', ctx && ctx.extension ? ctx.extension.macro : null);
        console.log('FlowMe', BUILD_TAG, 'context extension flags', {
          isConfig: ctx && ctx.extension ? ctx.extension.isConfig : undefined,
          type: ctx && ctx.extension ? ctx.extension.type : undefined,
          mode: ctx && ctx.extension ? ctx.extension.mode : undefined,
          renderMode: ctx && ctx.extension ? ctx.extension.renderMode : undefined,
          location: ctx && ctx.extension ? ctx.extension.location : undefined,
          context: ctx && ctx.extension ? ctx.extension.context : undefined,
        });
        setContext(ctx);
      } catch (e) {
        setContext(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const moduleKey = getModuleKey(context);
  const modalContext = getModalContext(context);
  const siteUrl = getSiteUrl(context);
  const pageId = modalContext && modalContext.pageId ? String(modalContext.pageId) : getPageId(context);
  const macroExtension = context && context.extension ? context.extension.macro : null;
  const isMacroEdit = Boolean(
    (modalContext && modalContext.mode === 'config') ||
      (macroExtension && macroExtension.isConfiguring === true && macroExtension.isInserting === false)
  );

  const isEditorModal = useMemo(() => {
    if (!modalContext) return false;
    return modalContext.mode === 'editor';
  }, [modalContext]);

  const isSettingsPage = useMemo(() => {
    if (moduleKey === 'flowmecloud-settings') return true;
    try {
      return window.location.pathname.indexOf('/apps/flowme-cloud-settings') !== -1;
    } catch (e) {
      return false;
    }
  }, [moduleKey]);

  const isMacroConfig = useMemo(() => {
    if (modalContext && modalContext.mode === 'config') return true;
    return detectMacroConfigContext(context, moduleKey);
  }, [context, moduleKey, modalContext]);
  console.log('FlowMe', BUILD_TAG, 'flags', {
    moduleKey,
    isEditorModal,
    isSettingsPage,
    isMacroConfig,
    modalContext,
  });

  const diagramFromContext = getDiagramConfigFromContext(context);
  const diagramConfig = useMemo(() => {
    const base = mergeDiagramConfig(DEFAULT_DIAGRAM, diagramFromContext);
    return mergeDiagramConfig(base, modalContext);
  }, [diagramFromContext, modalContext]);

  if (loading) {
    return <div style={{ padding: 16 }}>Loading...</div>;
  }

  if (isEditorModal) {
    console.log('FlowMe', BUILD_TAG, 'render editor modal', {
      pageId,
      diagramName: diagramConfig.diagramName,
    });
    return (
      <EditorModal
        pageId={pageId}
        siteUrl={siteUrl}
        diagramName={diagramConfig.diagramName}
        loadVersion={modalContext && modalContext.loadVersion ? String(modalContext.loadVersion) : ''}
        buildTag={BUILD_TAG}
      />
    );
  }

  if (isSettingsPage) {
    console.log('FlowMe', BUILD_TAG, 'render admin settings');
    return <AdminSettings />;
  }

  if (isMacroConfig) {
    console.log('FlowMe', BUILD_TAG, 'render macro config', diagramConfig);
    return (
      <MacroConfig
        initialDiagram={diagramConfig}
        pageId={pageId}
        isEdit={isMacroEdit}
      />
    );
  }

  console.log('FlowMe', BUILD_TAG, 'render macro view', {
    pageId,
    diagramName: diagramConfig.diagramName,
  });
  return (
    <MacroView
      pageId={pageId}
      siteUrl={siteUrl}
      initialDiagram={diagramConfig}
      isEditing={isEditingContext(context)}
    />
  );
}
