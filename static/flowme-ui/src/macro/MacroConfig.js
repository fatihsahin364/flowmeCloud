import React, { useEffect, useMemo, useState } from 'react';
import { invoke, Modal, view } from '@forge/bridge';
import icon32 from '../assets/icon-32.png';

const DIAGRAM_NAME_MAX = 64;
let supportsUnicodeProps = false;
try {
  supportsUnicodeProps = !!new RegExp('\\p{L}', 'u');
} catch (e) {
  supportsUnicodeProps = false;
}

function normalizeDiagramName(raw) {
  if (raw == null) return '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

function validateDiagramName(raw) {
  const value = normalizeDiagramName(raw);
  if (!value) {
    return { ok: false, error: 'Diagram name is required.' };
  }
  if (value.length > DIAGRAM_NAME_MAX) {
    return { ok: false, error: `Diagram name is too long (max ${DIAGRAM_NAME_MAX} characters).` };
  }
  if (/[\u0000-\u001F\u007F]/.test(value)) {
    return { ok: false, error: 'Diagram name contains invalid control characters.' };
  }
  if (/[<>\"'\\/]/.test(value)) {
    return {
      ok: false,
      error: 'Diagram name contains invalid characters. Allowed: letters/numbers, space, _, ., -, (, ).',
    };
  }
  let ok = false;
  if (supportsUnicodeProps) {
    ok = /^[\p{L}\p{N}][\p{L}\p{N} _().-]*$/u.test(value);
  } else {
    ok = /^[A-Za-z0-9][A-Za-z0-9 _().-]*$/.test(value);
  }
  if (!ok) {
    return {
      ok: false,
      error: 'Diagram name contains invalid characters. Allowed: letters/numbers, space, _, ., -, (, ).',
    };
  }
  return { ok: true, value };
}

function computeSuggestedDiagramName(existingNames) {
  const taken = new Set((existingNames || []).map((name) => String(name)));
  for (let n = 1; n < 10000; n += 1) {
    const candidate = `diagram-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return 'diagram-1';
}

function validateWidthInput(raw) {
  const value = raw == null ? '' : String(raw).trim();
  if (!value) {
    return { ok: true, value: '' };
  }
  if (!/^[0-9]{1,6}$/.test(value)) {
    return { ok: false, error: 'Width must be a positive integer (pixels).' };
  }
  const numberValue = parseInt(value, 10);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return { ok: false, error: 'Width must be a positive integer (pixels).' };
  }
  return { ok: true, value: String(numberValue) };
}

export default function MacroConfig({ initialDiagram, pageId, isEdit }) {
  const [diagram, setDiagram] = useState(initialDiagram);
  const [macroStatus, setMacroStatus] = useState('');
  const [existingNames, setExistingNames] = useState([]);
  const [loadingNames, setLoadingNames] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  useEffect(() => {
    console.log('FlowMe', 'macro config mount', initialDiagram);
    setDiagram(initialDiagram);
    setNameTouched(false);
    if (view && typeof view.resize === 'function') {
      const resize = () => {
        try {
          view.resize({ height: 360 });
        } catch (e) {
          // Ignore resize failures for non-resizable views.
        }
      };
      resize();
      const t1 = setTimeout(resize, 200);
      const t2 = setTimeout(resize, 800);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [
    initialDiagram.diagramName,
    initialDiagram.width,
    initialDiagram.border,
  ]);

  useEffect(() => {
    if (!pageId || isEdit) return;
    setLoadingNames(true);
    (async () => {
      try {
        const result = await invoke('listDiagrams', { pageId });
        if (result && result.ok && Array.isArray(result.names)) {
          setExistingNames(result.names);
          const suggested = computeSuggestedDiagramName(result.names);
          setDiagram((prev) => {
            if (nameTouched) return prev;
            const currentName = String(prev.diagramName || '');
            if (!currentName || currentName === 'diagram-1') {
              return { ...prev, diagramName: suggested };
            }
            return prev;
          });
        }
      } catch (e) {
        setExistingNames([]);
      } finally {
        setLoadingNames(false);
      }
    })();
  }, [pageId, isEdit]);

  const onDiagramFieldChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === 'checkbox' ? checked : value;
    if (name === 'diagramName') {
      setNameTouched(true);
    }
    setDiagram((prev) => ({ ...prev, [name]: nextValue }));
  };

  const openEditorModal = async (name, onClose) => {
    if (!pageId || !name) return;
    const modal = new Modal({
      resource: 'flowme-ui',
      size: 'max',
      onClose,
      context: {
        mode: 'editor',
        pageId,
        diagramName: name,
        width: diagram.width,
        border: diagram.border,
      },
    });
    await modal.open();
  };

  const validation = useMemo(() => {
    const nameCheck = validateDiagramName(diagram.diagramName);
    if (!nameCheck.ok) {
      return { ok: false, error: nameCheck.error };
    }
    const widthCheck = validateWidthInput(diagram.width);
    if (!widthCheck.ok) {
      return { ok: false, error: widthCheck.error };
    }
    if (!isEdit && existingNames.includes(nameCheck.value)) {
      return {
        ok: false,
        error: 'A diagram with this name already exists on this page. Choose a different name.',
      };
    }
    return { ok: true, value: nameCheck.value, width: widthCheck.value };
  }, [diagram.diagramName, diagram.width, existingNames, isEdit]);

  const hintText = isEdit ? '' : 'Insert will add the macro and open the editor.';

  return (
    <div style={{ padding: 12, maxWidth: 520, fontSize: 13, lineHeight: 1.3 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <img src={icon32} alt="FlowMe" width="18" height="18" />
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {isEdit ? 'Edit FlowMe diagram' : 'Insert FlowMe diagram'}
        </h3>
      </div>
      {macroStatus ? <div style={{ marginBottom: 12 }}>{macroStatus}</div> : null}
      <div style={{ display: 'grid', gap: 8 }}>
        <label>
          Diagram name
          <input
            type="text"
            name="diagramName"
            value={diagram.diagramName}
            onChange={onDiagramFieldChange}
            style={{ width: '100%' }}
            disabled={isEdit}
          />
        </label>
        {hintText ? <div style={{ fontSize: 12, color: '#6b778c' }}>{hintText}</div> : null}
        <label>
          Width (px)
          <input
            type="number"
            name="width"
            value={diagram.width}
            onChange={onDiagramFieldChange}
            style={{ width: '100%' }}
            min="1"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            name="border"
            checked={Boolean(diagram.border)}
            onChange={onDiagramFieldChange}
          />
          Show border around preview
        </label>
      </div>
      {loadingNames ? (
        <div style={{ marginTop: 6, fontSize: 12, color: '#6b778c' }}>
          Checking existing diagrams...
        </div>
      ) : null}
      <div style={{ marginTop: 10, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => view.close()}>
          Cancel
        </button>
        <button
          type="button"
          onClick={async () => {
            setMacroStatus('');
            if (!validation.ok) {
              setMacroStatus(validation.error || 'Please fix the errors.');
              return;
            }
            try {
              console.log('FlowMe', 'macro config submit', {
                diagramName: validation.value,
                width: validation.width,
                border: diagram.border,
              });
              if (isEdit) {
                await view.submit({
                  config: {
                    diagramName: validation.value,
                    width: validation.width,
                    border: diagram.border,
                  },
                });
                return;
              }
              setMacroStatus('Opening editor...');
              await openEditorModal(validation.value, async (payload) => {
                if (!payload || !payload.refreshed) {
                  setMacroStatus('Insert cancelled.');
                  return;
                }
                try {
                  await view.submit({
                    config: {
                      diagramName: validation.value,
                      width: validation.width,
                      border: diagram.border,
                    },
                  });
                } catch (submitError) {
                  const submitMessage =
                    submitError && submitError.message
                      ? submitError.message
                      : 'Failed to insert diagram.';
                  setMacroStatus(submitMessage);
                }
              });
            } catch (e) {
              const message = e && e.message ? e.message : 'Failed to save macro settings.';
              setMacroStatus(message);
            }
          }}
          disabled={!validation.ok}
        >
          {isEdit ? 'Save' : 'Insert diagram'}
        </button>
      </div>
    </div>
  );
}
