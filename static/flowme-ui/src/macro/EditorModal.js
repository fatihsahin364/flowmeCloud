import React, { useEffect, useRef, useState } from 'react';
import { invoke, view } from '@forge/bridge';
import { DRAWIO_ORIGIN, DRAWIO_URL, extractSvgFromExport, extractXmlFromExport } from '../lib/drawio';

export default function EditorModal({ pageId, diagramName, siteUrl, loadVersion, buildTag, initialXml }) {
  const [macroStatus, setMacroStatus] = useState('');
  const [editorReady, setEditorReady] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorXml, setEditorXml] = useState('');
  const [editorIsNew, setEditorIsNew] = useState(false);
  const iframeRef = useRef(null);
  const pendingSaveRef = useRef({ xml: null, svg: null });
  const saveTimeoutRef = useRef(null);
  const pendingCloseRef = useRef(false);

  useEffect(() => {
    if (!pageId || !diagramName) return;
    console.log('FlowMe', buildTag, 'editor modal mount', { pageId, diagramName });
    setMacroStatus('');
    if (initialXml && String(initialXml).trim()) {
      setEditorXml(String(initialXml));
      setEditorIsNew(false);
      setEditorReady(false);
      return;
    }
    (async () => {
      try {
        const data = await invoke('loadDiagram', {
          pageId,
          diagramName,
          siteUrl,
          version: loadVersion || undefined,
        });
        if (data && data.ok === false) {
          throw new Error(data.error || 'Failed to load diagram.');
        }
        setEditorXml(data && data.xml ? data.xml : '');
        setEditorIsNew(!(data && data.hasXml));
        setEditorReady(false);
      } catch (e) {
        const message = e && e.message ? e.message : 'Failed to open the editor.';
        setMacroStatus(message);
      }
    })();
  }, [pageId, diagramName, siteUrl, loadVersion, initialXml]);

  useEffect(() => {
    function onMessage(event) {
      if (event.origin !== DRAWIO_ORIGIN) return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      if (message.event === 'init') {
        setEditorReady(true);
        if (editorXml) {
          postToDrawio({ action: 'load', xml: editorXml, title: diagramName });
        } else if (editorIsNew) {
          postToDrawio({ action: 'template' });
        }
      }

      if (message.event === 'save') {
        const initialXml = extractXmlFromExport(message);
        pendingSaveRef.current = { xml: initialXml, svg: null };
        setEditorBusy(true);
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
          const pending = pendingSaveRef.current;
          if (!pending.xml || !pending.svg) {
            setMacroStatus('Failed to export diagram data. Please try again.');
            setEditorBusy(false);
          }
        }, 8000);
        postToDrawio({ action: 'export', format: 'svg' });
        if (!initialXml) {
          postToDrawio({ action: 'export', format: 'xml' });
        }
      }

      if (message.event === 'export') {
        const pending = pendingSaveRef.current;
        if (pending.xml === null && (message.format === 'xml' || message.xml || message.data)) {
          pending.xml = extractXmlFromExport(message);
        }
        if (pending.svg === null) {
          const svg = extractSvgFromExport(message);
          if (svg) {
            pending.svg = svg;
          }
        }
        if (pending.xml && pending.svg) {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
          }
          saveDiagram(pending.xml, pending.svg);
        }
      }

      if (message.event === 'exit') {
        if (editorBusy) {
          pendingCloseRef.current = true;
          return;
        }
        closeEditor();
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [editorXml, editorIsNew, editorBusy, diagramName, pageId, siteUrl]);

  const postToDrawio = (payload) => {
    if (!iframeRef.current || !iframeRef.current.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(JSON.stringify(payload), DRAWIO_ORIGIN);
  };

  const closeEditor = (payload) => {
    view.close(payload || { refreshed: false });
  };

  const saveDiagram = async (xml, svg) => {
    try {
      const res = await invoke('saveDiagram', {
        pageId,
        diagramName,
        xml,
        svg,
        createOnly: editorIsNew,
      });
      if (!res || res.ok !== true) {
        const message = res && res.error ? res.error : 'Failed to save diagram.';
        setMacroStatus(message);
        return;
      }
      setMacroStatus('Diagram saved.');
      closeEditor({
        refreshed: true,
        diagramName,
        refreshedAt: new Date().toISOString(),
      });
    } catch (e) {
      const message = e && e.message ? e.message : 'Failed to save diagram.';
      setMacroStatus(message);
    } finally {
      setEditorBusy(false);
      if (pendingCloseRef.current) {
        pendingCloseRef.current = false;
        closeEditor({ refreshed: false });
      }
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          background: '#fff',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #dfe1e6',
        }}
      >
        <strong>Editing {diagramName}</strong>
        <button type="button" onClick={() => closeEditor({ refreshed: false })} disabled={editorBusy}>
          Close
        </button>
      </div>
      {macroStatus ? <div style={{ padding: 12 }}>{macroStatus}</div> : null}
      <iframe
        ref={iframeRef}
        title="FlowMe draw.io editor"
        src={DRAWIO_URL}
        style={{ flex: 1, border: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}
