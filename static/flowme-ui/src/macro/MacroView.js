import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke, Modal, view } from '@forge/bridge';

export default function MacroView({ pageId, siteUrl, initialDiagram, isEditing }) {
  const [diagram, setDiagram] = useState(initialDiagram);
  const [svgUrl, setSvgUrl] = useState('');
  const [macroStatus, setMacroStatus] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 });
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const imgRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    setDiagram(initialDiagram);
    setZoom(1);
    setBaseSize({ width: 0, height: 0 });
  }, [initialDiagram.diagramName, initialDiagram.width, initialDiagram.border]);

  const loadVersions = async (preferLatest) => {
    if (!isEditing || !pageId || !diagram.diagramName) {
      setVersions([]);
      setSelectedVersion('');
      return '';
    }
    try {
      const data = await invoke('listDiagramVersions', {
        pageId,
        diagramName: diagram.diagramName,
      });
      if (data && data.ok && Array.isArray(data.versions)) {
        const ordered = [...data.versions].sort((a, b) => (b.number || 0) - (a.number || 0));
        console.log('FlowMe', 'versions loaded', {
          diagramName: diagram.diagramName,
          count: ordered.length,
        });
        setVersions(ordered);
        if (preferLatest && ordered.length) {
          const latest = String(ordered[0].number || '');
          setSelectedVersion(latest);
          return latest;
        } else if (!ordered.length) {
          setSelectedVersion('');
          return '';
        }
        return selectedVersion;
      } else {
        console.log('FlowMe', 'versions empty', data);
        setVersions([]);
        setSelectedVersion('');
        return '';
      }
    } catch (e) {
      console.log('FlowMe', 'versions load failed', e && e.message ? e.message : e);
      setVersions([]);
      setSelectedVersion('');
      return '';
    }
  };

  useEffect(() => {
    loadVersions(!selectedVersion);
  }, [isEditing, pageId, diagram.diagramName]);

  useEffect(() => {
    if (!pageId || !diagram.diagramName) return;
    refreshPreview(diagram.diagramName, selectedVersion);
  }, [pageId, diagram.diagramName, isEditing, selectedVersion]);


  const refreshPreview = async (name, version) => {
    if (!pageId || !name) return;
    setMacroStatus('');
    setSvgUrl('');
    try {
      const data = await invoke('loadDiagram', {
        pageId,
        diagramName: name,
        siteUrl,
        version: version || undefined,
      });
      if (data && data.ok === false) {
        throw new Error(data.error || 'Failed to load diagram.');
      }
      if (data && data.svg) {
        const encoded = encodeURIComponent(data.svg);
        setSvgUrl(`data:image/svg+xml;utf8,${encoded}`);
        return true;
      } else if (data && data.svgUrl) {
        const fullUrl = /^https?:\/\//i.test(data.svgUrl)
          ? data.svgUrl
          : siteUrl
          ? `${siteUrl}${data.svgUrl}`
          : data.svgUrl;
        setSvgUrl(fullUrl);
        return true;
      } else {
        setSvgUrl('');
        return false;
      }
    } catch (e) {
      const message = e && e.message ? e.message : 'Failed to load diagram preview.';
      setMacroStatus(message);
      setSvgUrl('');
      return false;
    }
  };

  const openEditor = async (loadVersion) => {
    if (!pageId) {
      setMacroStatus('Please publish the page first so a page ID is available.');
      return;
    }
    if (!diagram.diagramName) {
      setMacroStatus('Please configure the diagram first.');
      return;
    }
    setMacroStatus('');
    setEditorBusy(true);
    try {
      const modal = new Modal({
        resource: 'flowme-ui',
        onClose: async (payload) => {
          if (payload && payload.refreshed) {
            const latest = await loadVersions(true);
            await refreshPreview(payload.diagramName || diagram.diagramName, latest || selectedVersion);
          }
        },
        size: 'max',
        context: {
          mode: 'editor',
          pageId,
          diagramName: diagram.diagramName,
          width: diagram.width,
          border: diagram.border,
          loadVersion: loadVersion || undefined,
        },
      });
      await modal.open();
    } catch (e) {
      const message = e && e.message ? e.message : 'Failed to open the editor. Please try again.';
      setMacroStatus(message);
    } finally {
      setEditorBusy(false);
    }
  };

  const hasBorder = Boolean(diagram.border);
  const widthStyle = diagram.width ? { maxWidth: `${diagram.width}px` } : {};
  const wrapperClass = useMemo(() => {
    const classes = ['flowme-diagram-wrapper'];
    classes.push(diagram.width ? 'flowme-has-width' : 'flowme-auto-width');
    if (hasBorder) classes.push('flowme-has-border');
    if (isEditing) classes.push('flowme-editor-mode');
    return classes.join(' ');
  }, [diagram.width, hasBorder, isEditing]);
  const showPreviewToolbar = !isEditing && Boolean(diagram.diagramName);
  const zoomIn = () => setZoom((value) => Math.min(2, Math.round((value + 0.1) * 10) / 10));
  const zoomOut = () => setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10));
  const scaledWidth = baseSize.width ? Math.round(baseSize.width * zoom) : 0;
  const scaledHeight = baseSize.height ? Math.round(baseSize.height * zoom) : 0;
  const previewStyle =
    scaledWidth && scaledHeight ? { width: `${scaledWidth}px`, height: `${scaledHeight}px` } : {};

  const computeWidthPresetPx = (preset) => {
    let available = 0;
    if (boxRef.current && boxRef.current.parentElement) {
      available = Math.round(boxRef.current.parentElement.getBoundingClientRect().width || 0);
    }
    if (!available && boxRef.current) {
      available = Math.round(boxRef.current.getBoundingClientRect().width || 0);
    }
    if (!available && typeof window !== 'undefined') {
      available = Math.round(window.innerWidth || 0);
    }
    const maxAllowed = Math.max(320, available - 24);
    let target = 300;
    if (preset === 'min') {
      target = 300;
    } else if (preset === 'mid') {
      target = Math.round(maxAllowed * 0.5);
    } else {
      target = Math.round(maxAllowed * 0.98);
    }
    const minPx = 220;
    const maxPx = 2600;
    return Math.max(minPx, Math.min(maxPx, target));
  };

  const updateMacroWidth = async (nextWidth) => {
    const nextDiagram = { ...diagram, width: nextWidth };
    setDiagram(nextDiagram);
    if (!isEditing || !view || typeof view.submit !== 'function') {
      return;
    }
    try {
      await view.submit({
        config: {
          diagramName: nextDiagram.diagramName,
          width: nextDiagram.width,
          border: nextDiagram.border,
        },
        keepEditing: true,
      });
    } catch (e) {
      setMacroStatus('Width updated locally. Open macro settings to save it.');
    }
  };

  const applyWidthPreset = (preset) => {
    if (preset === 'restore') {
      updateMacroWidth('');
      return;
    }
    const px = computeWidthPresetPx(preset);
    updateMacroWidth(String(px));
  };

  const formatVersionLabel = (version) => {
    if (!version) return '';
    const number = version.number != null ? `v. ${version.number}` : 'v. ?';
    const when = version.when ? new Date(version.when) : null;
    const dateLabel =
      when && !Number.isNaN(when.valueOf())
        ? when.toLocaleString('tr-TR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
    const by = version.by ? version.by : '';
    const datePart = dateLabel ? ` [${dateLabel}]` : '';
    const byPart = by ? ` ${by}` : '';
    return `${number}${byPart}${datePart}`;
  };

  return (
    <div className={wrapperClass}>
      {macroStatus ? <div style={{ marginTop: 12 }}>{macroStatus}</div> : null}

      <div
        className="flowme-diagram-box"
        style={{
          ...widthStyle,
        }}
        ref={boxRef}
      >
        {isEditing ? (
          <div className="flowme-editor-hover-toolbar">
            <select
              className="flowme-editor-hover-version-select"
              aria-label="Diagram version"
              value={selectedVersion}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedVersion(next);
                refreshPreview(diagram.diagramName, next);
              }}
            >
              {versions.length === 0 ? <option value="">v?</option> : null}
              {versions.map((version) => (
                <option key={version.number} value={String(version.number)}>
                  {formatVersionLabel(version)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="aui-button aui-button-primary"
              onClick={() => openEditor(selectedVersion ? String(selectedVersion) : '')}
              disabled={editorBusy}
            >
              {editorBusy ? 'Opening...' : 'Edit diagram'}
            </button>
            <span className="flowme-editor-hover-width-group" aria-label="Diagram width presets">
              <button
                type="button"
                className="aui-button flowme-editor-hover-width-btn flowme-editor-hover-width-restore"
                aria-label="Restore auto width"
                onClick={() => applyWidthPreset('restore')}
              >
                <span className="flowme-width-icon flowme-width-icon-restore" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="aui-button flowme-editor-hover-width-btn flowme-editor-hover-width-max"
                aria-label="Max width"
                onClick={() => applyWidthPreset('max')}
              >
                <span className="flowme-width-icon flowme-width-icon-max" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="aui-button flowme-editor-hover-width-btn flowme-editor-hover-width-mid"
                aria-label="Medium width"
                onClick={() => applyWidthPreset('mid')}
              >
                <span className="flowme-width-icon flowme-width-icon-mid" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="aui-button flowme-editor-hover-width-btn flowme-editor-hover-width-min"
                aria-label="Min width"
                onClick={() => applyWidthPreset('min')}
              >
                <span className="flowme-width-icon flowme-width-icon-min" aria-hidden="true" />
              </button>
            </span>
          </div>
        ) : null}
        {showPreviewToolbar ? (
          <div className="flowme-diagram-toolbar">
            <div className="flowme-diagram-toolbar-left">
              <button type="button" className="flowme-zoom-btn" onClick={zoomOut}>
                <span aria-hidden="true">−</span>
              </button>
              <button type="button" className="flowme-zoom-btn" onClick={zoomIn}>
                <span aria-hidden="true">+</span>
              </button>
            </div>
            <div className="flowme-diagram-toolbar-center">
              <span className="flowme-diagram-title">{diagram.diagramName}</span>
            </div>
            <div className="flowme-diagram-toolbar-right">
              <div className="flowme-diagram-toolbar-actions" />
            </div>
          </div>
        ) : null}
        <div className="flowme-diagram-preview" style={previewStyle}>
          {svgUrl ? (
            <img
              ref={imgRef}
              src={svgUrl}
              alt="Diagram preview"
              onLoad={(event) => {
                const img = event.currentTarget;
                let width = img.naturalWidth || img.width || 0;
                let height = img.naturalHeight || img.height || 0;
                if (!width || !height) {
                  const rect = img.getBoundingClientRect();
                  width = rect.width;
                  height = rect.height;
                }
                if (diagram.width) {
                  const cap = parseInt(diagram.width, 10);
                  if (Number.isFinite(cap) && cap > 0) {
                    width = Math.min(width || cap, cap);
                    if (height && img.naturalWidth) {
                      height = Math.round((height * width) / img.naturalWidth);
                    }
                  }
                }
                if (width && height) {
                  setBaseSize({ width, height });
                }
              }}
              style={{
                width: scaledWidth ? `${scaledWidth}px` : undefined,
                height: scaledHeight ? `${scaledHeight}px` : undefined,
              }}
            />
          ) : (
            <div className="flowme-diagram-preview-empty">
              <em>No diagram saved yet.</em>
            </div>
          )}
        </div>
      </div>
      {isEditing ? (
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b778c' }}>
          To change diagram settings (name, width, border), use Confluence macro settings.
        </div>
      ) : null}
    </div>
  );
}
