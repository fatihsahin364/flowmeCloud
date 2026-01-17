import React, { useEffect, useRef, useState } from 'react';
import { view } from '@forge/bridge';

export default function AiTextModal({ title, mode }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  // This modal is opened in a separate Forge dialog so it never gets clipped by the macro box.
  useEffect(() => {
    console.log('FlowMe', 'AI text modal mounted', { title, mode });
    try {
      view.resize({ height: 760 });
    } catch (e) {
      // Ignore resize failures for non-resizable views.
    }
    try {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    } catch (e) {
      // Ignore focus failures.
    }
  }, []);

  const closeModal = (payload) => {
    view.close(payload || { canceled: true });
  };

  const submit = () => {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      setError('Please describe the workflow to generate the diagram.');
      return;
    }
    if (trimmed.length > 12000) {
      setError('Text is too long. Please shorten the workflow description.');
      return;
    }
    closeModal({ text: trimmed, mode });
  };

  return (
    <div
      style={{
        padding: 16,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <strong>{title || 'Generate diagram from text'}</strong>
      </div>
      <label
        style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}
        htmlFor="flowme-ai-text-input"
      >
        Workflow description
      </label>
      <textarea
        id="flowme-ai-text-input"
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={12}
        style={{
          width: '100%',
          minHeight: 320,
          flex: 1,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
        placeholder="Example: When a request arrives, validate, route to reviewer, if approved then notify..."
      />
      {error ? <div style={{ color: '#de350b', marginTop: 8 }}>{error}</div> : null}
      <div style={{ color: '#6b778c', fontSize: 12, marginTop: 8 }}>
        We will send your text to AI to generate draw.io XML.
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" className="aui-button aui-button-link" onClick={() => closeModal()}>
          Cancel
        </button>
        <button type="button" className="aui-button aui-button-primary" onClick={submit}>
          Generate
        </button>
      </div>
    </div>
  );
}
