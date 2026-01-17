import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke, Modal, showFlag, view } from '@forge/bridge';
import icon64 from '../assets/icon-64.png';

export default function MacroView({ pageId, siteUrl, initialDiagram, isEditing }) {
  const [diagram, setDiagram] = useState(initialDiagram);
  const [svgUrl, setSvgUrl] = useState('');
  const [macroStatus, setMacroStatus] = useState('');
  const [editorBusy, setEditorBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 });
  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiMenuPos, setAiMenuPos] = useState({ left: 0, top: 0 });
  const [aiBusy, setAiBusy] = useState(false);
  const imgRef = useRef(null);
  const boxRef = useRef(null);
  const aiButtonRef = useRef(null);
  const aiMenuRef = useRef(null);
  const aiFileInputRef = useRef(null);
  const aiMenuPrevHeightRef = useRef(null);
  const aiPollTimerRef = useRef(null);
  const aiPollStartRef = useRef(0);
  const aiPollJobRef = useRef('');

  // Close the AI menu when the user clicks outside, scrolls, or presses Escape.
  useEffect(() => {
    setDiagram(initialDiagram);
    setZoom(1);
    setBaseSize({ width: 0, height: 0 });
    setAiMenuOpen(false);
  }, [initialDiagram.diagramName, initialDiagram.width, initialDiagram.border]);

  useEffect(() => {
    return () => {
      if (aiPollTimerRef.current) {
        clearTimeout(aiPollTimerRef.current);
        aiPollTimerRef.current = null;
      }
      aiPollJobRef.current = '';
      aiPollStartRef.current = 0;
    };
  }, []);

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

  // Refresh the available versions when the diagram context changes.
  useEffect(() => {
    loadVersions(!selectedVersion);
  }, [isEditing, pageId, diagram.diagramName]);

  useEffect(() => {
    if (!pageId || !diagram.diagramName) return;
    refreshPreview(diagram.diagramName, selectedVersion);
  }, [pageId, diagram.diagramName, isEditing, selectedVersion]);

  const updateBaseSizeFromImage = () => {
    const img = imgRef.current;
    if (!img) return;
    let width = img.naturalWidth || img.width || 0;
    let height = img.naturalHeight || img.height || 0;
    if (!width || !height) {
      const rect = img.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }
    if (width && height) {
      setBaseSize({ width, height });
    }
  };

  useEffect(() => {
    if (!svgUrl) return;
    if (!imgRef.current) return;
    const img = imgRef.current;
    if (img.complete) {
      updateBaseSizeFromImage();
      return;
    }
    const onLoad = () => updateBaseSizeFromImage();
    img.addEventListener('load', onLoad);
    return () => img.removeEventListener('load', onLoad);
  }, [svgUrl, diagram.width]);

  useEffect(() => {
    if (!aiMenuOpen) return;
    const onDocClick = (event) => {
      const target = event && event.target ? event.target : null;
      if (aiMenuRef.current && aiMenuRef.current.contains(target)) return;
      if (aiButtonRef.current && aiButtonRef.current.contains(target)) return;
      setAiMenuOpen(false);
    };
    const onKey = (event) => {
      if (event && event.key === 'Escape') {
        setAiMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDocClick, true);
    window.addEventListener('scroll', onDocClick, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDocClick, true);
      window.removeEventListener('scroll', onDocClick, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [aiMenuOpen]);

  useEffect(() => {
    if (!view || typeof view.resize !== 'function') return;
    if (!aiMenuOpen) {
      if (aiMenuPrevHeightRef.current) {
        try {
          view.resize({ height: aiMenuPrevHeightRef.current });
        } catch (e) {
          // Ignore resize failures for non-resizable views.
        } finally {
          aiMenuPrevHeightRef.current = null;
        }
      }
      return;
    }
    try {
      const bodyHeight = document.body ? document.body.getBoundingClientRect().height : 0;
      const viewportHeight = window.innerHeight || 0;
      if (!aiMenuPrevHeightRef.current) {
        aiMenuPrevHeightRef.current = Math.round(bodyHeight || viewportHeight || 0) || null;
      }
      let targetHeight = Math.max(bodyHeight || 0, viewportHeight || 0);
      const menu = aiMenuRef.current;
      if (menu) {
        const rect = menu.getBoundingClientRect();
        const overflow = rect.bottom + 16 - (viewportHeight || 0);
        if (overflow > 0) {
          targetHeight = Math.max(targetHeight, (bodyHeight || 0) + overflow);
        }
      }
      if (targetHeight > 0) {
        view.resize({ height: Math.round(targetHeight) });
      }
    } catch (e) {
      // Ignore resize failures for non-resizable views.
    }
  }, [aiMenuOpen, aiMenuPos.left, aiMenuPos.top]);

  useEffect(() => {
    if (!aiMenuOpen) return;
    const btn = aiButtonRef.current;
    const menu = aiMenuRef.current;
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    const menuW = menu.offsetWidth || 240;
    const menuH = menu.offsetHeight || 80;
    const winW = window.innerWidth || 0;
    const winH = window.innerHeight || 0;
    let left = rect.left;
    let top = rect.bottom + 6;
    const maxLeft = winW - menuW - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    const maxTop = winH - menuH - 8;
    if (top > maxTop) {
      top = rect.top - menuH - 6;
    }
    if (top < 8) top = 8;
    setAiMenuPos((prev) => {
      if (prev.left === left && prev.top === top) return prev;
      return { left, top };
    });
  }, [aiMenuOpen]);


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

  // Open the draw.io editor with AI-generated XML preloaded, so the user can review and save.
  const openEditorWithXml = async (xml) => {
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
          initialXml: xml,
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

  const buildAiMenuLabel = () => {
    if (!aiBusy) return 'AI';
    return 'Generating...';
  };

  const toggleAiMenu = () => {
    if (aiBusy) return;
    setAiMenuOpen((prev) => !prev);
  };

  const ensureAiReady = () => {
    if (!pageId) {
      setMacroStatus('Please publish the page first so a page ID is available.');
      return false;
    }
    if (!diagram.diagramName) {
      setMacroStatus('Please configure the diagram first.');
      return false;
    }
    return true;
  };

  const showAiError = (message) => {
    const text = message && String(message).trim() ? String(message).trim() : 'AI request failed.';
    setMacroStatus('');
    if (typeof showFlag === 'function') {
      try {
        showFlag({
          id: `flowme-ai-${Date.now()}`,
          title: 'FlowMe AI',
          type: 'error',
          description: text,
          isAutoDismiss: true,
        });
      } catch (e) {
        alert(`FlowMe AI: ${text}`);
      }
    } else {
      alert(`FlowMe AI: ${text}`);
    }
  };

  const clearAiPolling = () => {
    if (aiPollTimerRef.current) {
      clearTimeout(aiPollTimerRef.current);
      aiPollTimerRef.current = null;
    }
    aiPollJobRef.current = '';
    aiPollStartRef.current = 0;
  };

  const scheduleAiPoll = (jobId, delayMs) => {
    if (aiPollTimerRef.current) {
      clearTimeout(aiPollTimerRef.current);
      aiPollTimerRef.current = null;
    }
    aiPollTimerRef.current = setTimeout(() => {
      pollAiJob(jobId);
    }, delayMs);
  };

  const pollAiJob = async (jobId) => {
    if (!jobId) return;
    try {
      const res = await invoke('checkAiJobStatus', { jobId });
      if (res && res.ok && res.status === 'done' && res.xml) {
        clearAiPolling();
        setAiBusy(false);
        await openEditorWithXml(res.xml);
        return;
      }
      if (res && res.ok) {
        const startedAt = aiPollStartRef.current || Date.now();
        aiPollStartRef.current = startedAt;
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs > 4 * 60 * 1000) {
          clearAiPolling();
          setAiBusy(false);
          showAiError('AI is taking longer than expected. Please try again.');
          return;
        }
        scheduleAiPoll(jobId, 3000);
        return;
      }
      const err = res && res.error ? res.error : 'AI request failed.';
      clearAiPolling();
      setAiBusy(false);
      showAiError(err);
    } catch (e) {
      clearAiPolling();
      setAiBusy(false);
      showAiError(e && e.message ? e.message : 'AI request failed.');
    }
  };

  const openAiTextDialog = async (mode, title) => {
    if (!ensureAiReady()) return;
    setAiMenuOpen(false);
    try {
      console.log('FlowMe', 'opening AI text modal', { mode, title, diagramName: diagram.diagramName });
      const modal = new Modal({
        resource: 'flowme-ui',
        size: 'max',
        context: {
          mode: 'ai-text',
          title,
          diagramName: diagram.diagramName,
          promptMode: mode,
        },
        onClose: async (payload) => {
          if (!payload || !payload.text) return;
          await runAiText(payload.text, payload.mode || mode);
        },
      });
      await modal.open();
    } catch (e) {
      const message = e && e.message ? e.message : 'Failed to open the AI dialog.';
      setMacroStatus(message);
    }
  };

  // Submit the text prompt to the backend, then load the generated XML into the editor.
  const runAiText = async (textValue, modeValue) => {
    if (!ensureAiReady()) return;
    const trimmed = String(textValue || '').trim();
    if (!trimmed) {
      setMacroStatus('Please describe the workflow to generate the diagram.');
      return;
    }
    if (trimmed.length > 12000) {
      setMacroStatus('Text is too long. Please shorten the workflow description.');
      return;
    }
    setMacroStatus('Generating diagram with AI...');
    setAiBusy(true);
    try {
      const res = await invoke('startAiTextToDiagram', {
        pageId,
        diagramName: diagram.diagramName,
        text: trimmed,
        mode: modeValue,
      });
      if (!res || res.ok !== true) {
        const err = res && res.error ? res.error : 'AI request failed.';
        showAiError(err);
        return;
      }
      if (res.status === 'done' && res.xml) {
        setAiBusy(false);
        await openEditorWithXml(res.xml);
        return;
      }
      if (res.jobId) {
        aiPollJobRef.current = res.jobId;
        aiPollStartRef.current = Date.now();
        scheduleAiPoll(res.jobId, 2000);
        return;
      }
      showAiError('AI response did not return a job id.');
    } catch (e) {
      const message = e && e.message ? e.message : 'AI request failed.';
      showAiError(message);
    } finally {
      if (!aiPollJobRef.current) {
        setAiBusy(false);
      }
    }
  };

  // Resize screenshots client-side to keep the request payload below API limits.
  const resizeDataUrl = (dataUrl, opts) =>
    new Promise((resolve) => {
      try {
        const maxDim = opts && opts.maxDim ? opts.maxDim : 1280;
        const prefer = opts && opts.prefer ? opts.prefer : 'image/png';
        const img = new Image();
        img.onload = () => {
          try {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (!w || !h) {
              resolve(dataUrl);
              return;
            }
            const scale = Math.min(1, maxDim / Math.max(w, h));
            if (scale >= 0.999) {
              resolve(dataUrl);
              return;
            }
            const cw = Math.max(1, Math.round(w * scale));
            const ch = Math.max(1, Math.round(h * scale));
            const canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, cw, ch);
            resolve(canvas.toDataURL(prefer));
          } catch (_e1) {
            resolve(dataUrl);
          }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      } catch (_e0) {
        resolve(dataUrl);
      }
    });

  // Try a few compression strategies in sequence, keeping the best result.
  const compressIfNeeded = async (dataUrl) => {
    const maxChars = 1500000;
    if (dataUrl && dataUrl.length <= maxChars) return dataUrl;
    const first = await resizeDataUrl(dataUrl, { maxDim: 1280, prefer: 'image/png' });
    if (first && first.length <= maxChars) return first;
    const second = await resizeDataUrl(dataUrl, { maxDim: 1280, prefer: 'image/jpeg' });
    if (second && second.length <= maxChars) return second;
    const third = await resizeDataUrl(dataUrl, { maxDim: 1024, prefer: 'image/jpeg' });
    return third || dataUrl;
  };

  // Convert the selected image into a data URL and send it for AI reconstruction.
  const runAiPngFromFile = async (file) => {
    if (!ensureAiReady()) return;
    if (!file) return;
    if (file.type && file.type !== 'image/png' && file.type !== 'image/jpeg') {
      showAiError('Please select a PNG or JPEG file.');
      return;
    }
    setMacroStatus('Generating diagram with AI...');
    setAiBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawDataUrl = String(reader.result || '');
        if (!rawDataUrl || rawDataUrl.indexOf('data:image/') !== 0) {
          showAiError('Failed to read the image.');
          return;
        }
        const dataUrl = await compressIfNeeded(rawDataUrl);
        if (!dataUrl || dataUrl.indexOf('data:image/') !== 0) {
          showAiError('Failed to process the image.');
          return;
        }
        if (dataUrl.length > 4000000) {
          showAiError('Image is too large to send. Please use a smaller screenshot.');
          return;
        }
        const res = await invoke('startAiPngToDiagram', {
          pageId,
          diagramName: diagram.diagramName,
          imageDataUrl: dataUrl,
        });
        if (!res || res.ok !== true) {
          const err = res && res.error ? res.error : 'AI request failed.';
          showAiError(err);
          return;
        }
        if (res.status === 'done' && res.xml) {
          setAiBusy(false);
          await openEditorWithXml(res.xml);
          return;
        }
        if (res.jobId) {
          aiPollJobRef.current = res.jobId;
          aiPollStartRef.current = Date.now();
          scheduleAiPoll(res.jobId, 2000);
          return;
        }
        showAiError('AI response did not return a job id.');
      } catch (e) {
        const message = e && e.message ? e.message : 'AI request failed.';
        showAiError(message);
      } finally {
        if (!aiPollJobRef.current) {
          setAiBusy(false);
        }
      }
    };
    reader.onerror = () => {
      setAiBusy(false);
      showAiError('Failed to read the image.');
    };
    reader.readAsDataURL(file);
  };

  const onAiFileChange = (event) => {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (aiFileInputRef.current) {
      aiFileInputRef.current.value = '';
    }
    runAiPngFromFile(file);
  };

  const onAiMenuAction = (action) => {
    setAiMenuOpen(false);
    if (action === 'png') {
      if (!ensureAiReady()) return;
      if (aiFileInputRef.current) {
        aiFileInputRef.current.click();
      }
      return;
    }
    if (action === 'text-workflow') {
      openAiTextDialog('workflow', 'Generate workflow from text');
    } else if (action === 'text-swimlane') {
      openAiTextDialog('swimlane', 'Generate swimlane workflow from text');
    } else if (action === 'text-er') {
      openAiTextDialog('er', 'Generate ER diagram from text');
    } else if (action === 'text-smart') {
      openAiTextDialog('smart', 'Surprise me with the best diagram');
    }
  };

  const hasBorder = Boolean(diagram.border);
  const isEmpty = !svgUrl;
  const wrapperClass = useMemo(() => {
    const classes = ['flowme-diagram-wrapper'];
    classes.push(diagram.width ? 'flowme-has-width' : 'flowme-auto-width');
    if (hasBorder) classes.push('flowme-has-border');
    if (isEmpty && !diagram.width) classes.push('flowme-empty-state');
    if (isEditing) classes.push('flowme-editor-mode');
    return classes.join(' ');
  }, [diagram.width, hasBorder, isEditing, isEmpty]);
  const showPreviewToolbar = !isEditing && Boolean(diagram.diagramName);
  const zoomIn = () => setZoom((value) => Math.min(2, Math.round((value + 0.1) * 10) / 10));
  const zoomOut = () => setZoom((value) => Math.max(0.5, Math.round((value - 0.1) * 10) / 10));
  const previewSize = (() => {
    const naturalWidth = baseSize.width || 0;
    const naturalHeight = baseSize.height || 0;
    if (!naturalWidth || !naturalHeight) {
      return { width: 0, height: 0 };
    }
    const configuredWidth = diagram.width ? parseInt(diagram.width, 10) : 0;
    if (Number.isFinite(configuredWidth) && configuredWidth > 0) {
      const width = Math.round(configuredWidth * zoom);
      const height = Math.round((naturalHeight * width) / naturalWidth);
      return { width, height };
    }
    return {
      width: Math.round(naturalWidth * zoom),
      height: Math.round(naturalHeight * zoom),
    };
  })();
  const previewStyle =
    previewSize.width && previewSize.height
      ? { width: `${previewSize.width}px`, height: `${previewSize.height}px` }
      : {};
  const widthStyle = (() => {
    const configuredWidth = diagram.width ? parseInt(diagram.width, 10) : 0;
    if (Number.isFinite(configuredWidth) && configuredWidth > 0) {
      const scaledWidth = Math.round(configuredWidth * zoom);
      return { maxWidth: `${scaledWidth}px` };
    }
    return {};
  })();

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
      {aiBusy ? (
        <div className="flowme-wait-overlay" role="status" aria-live="polite">
          <div className="flowme-wait-overlay__box">
            <div className="flowme-wait-overlay__row">
              <div className="flowme-wait-overlay__spinner" />
              <div>
                <div className="flowme-wait-overlay__title">Generating diagram with AI…</div>
                <div className="flowme-wait-overlay__hint">
                  This may take a couple of minutes. Please keep this tab open.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {macroStatus ? <div style={{ marginTop: 12 }}>{macroStatus}</div> : null}

      <div
        className={`flowme-diagram-box${aiMenuOpen ? ' flowme-ai-menu-open' : ''}`}
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
            <button
              ref={aiButtonRef}
              type="button"
              className="aui-button flowme-editor-hover-ai flowme-ai-menu-trigger"
              aria-haspopup="true"
              aria-expanded={aiMenuOpen ? 'true' : 'false'}
              onClick={toggleAiMenu}
              disabled={aiBusy}
            >
              <span className="flowme-ai-menu-label">{buildAiMenuLabel()}</span>
              <span className="flowme-ai-menu-caret" aria-hidden="true" />
            </button>
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
        <div
          className={`flowme-diagram-preview${isEmpty ? ' flowme-diagram-preview-empty' : ''}`}
          style={previewStyle}
        >
          {svgUrl ? (
            <img
              ref={imgRef}
              src={svgUrl}
              alt="Diagram preview"
              onLoad={(event) => {
                updateBaseSizeFromImage();
              }}
              style={{
                width: previewSize.width ? `${previewSize.width}px` : undefined,
                height: previewSize.height ? `${previewSize.height}px` : undefined,
              }}
            />
          ) : (
            <div className="flowme-empty-content">
              <img className="flowme-empty-icon" src={icon64} width="64" height="64" alt="FlowMe" />
              <span className="flowme-empty-title">FlowMe diagram</span>
            </div>
          )}
        </div>
      </div>
      {isEditing ? (
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b778c' }}>
          To change diagram settings (width, border), use Confluence macro settings.
        </div>
      ) : null}
      {isEditing ? (
        <div
          className="flowme-ai-menu"
          ref={aiMenuRef}
          role="menu"
          style={{
            display: aiMenuOpen ? 'block' : 'none',
            left: aiMenuPos.left ? `${aiMenuPos.left}px` : undefined,
            top: aiMenuPos.top ? `${aiMenuPos.top}px` : undefined,
          }}
        >
          <div className="flowme-ai-menu-item" role="menuitem" onClick={() => onAiMenuAction('png')}>
            <span className="flowme-ai-menu-item-title">PNG &#8594; Diagram</span>
            <span className="flowme-ai-menu-item-desc">Upload a screenshot or sketch</span>
          </div>
          <div
            className="flowme-ai-menu-item"
            role="menuitem"
            onClick={() => onAiMenuAction('text-workflow')}
          >
            <span className="flowme-ai-menu-item-title">Text &#8594; Workflow</span>
            <span className="flowme-ai-menu-item-desc">Plain top-to-bottom flow, no swimlanes</span>
          </div>
          <div
            className="flowme-ai-menu-item"
            role="menuitem"
            onClick={() => onAiMenuAction('text-swimlane')}
          >
            <span className="flowme-ai-menu-item-title">Text &#8594; Swimlane Workflow</span>
            <span className="flowme-ai-menu-item-desc">Force lanes by role/actor</span>
          </div>
          <div
            className="flowme-ai-menu-item"
            role="menuitem"
            onClick={() => onAiMenuAction('text-er')}
          >
            <span className="flowme-ai-menu-item-title">Text &#8594; ER Diagram</span>
            <span className="flowme-ai-menu-item-desc">Entities, attributes, and relationships</span>
          </div>
          <div
            className="flowme-ai-menu-item"
            role="menuitem"
            onClick={() => onAiMenuAction('text-smart')}
          >
            <span className="flowme-ai-menu-item-title">Text &#8594; Best-Fit Diagram</span>
            <span className="flowme-ai-menu-item-desc">Trust the AI to choose the best fit</span>
          </div>
        </div>
      ) : null}
      <input
        ref={aiFileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: 'none' }}
        onChange={onAiFileChange}
      />
    </div>
  );
}
