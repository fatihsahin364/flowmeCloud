import React, { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

const DEFAULT_CONFIG = {
  enabled: false,
  aiProvider: 'openai',
  secretId: '',
  secretValue: '',
  model: 'gpt-5.2',
  apiBaseUrl: 'https://api.openai.com',
  allowedAiHosts: 'api.openai.com',
  timeoutSeconds: '360',
};

export default function AdminSettings() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await invoke('getConfig');
        if (stored && typeof stored === 'object') {
          setConfig({
            ...DEFAULT_CONFIG,
            ...stored,
            secretValue: '',
            timeoutSeconds: stored.timeoutSeconds ? String(stored.timeoutSeconds) : '360',
          });
          setSecretConfigured(Boolean(stored.secretValue));
        }
      } catch (e) {
        setStatus('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onFieldChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === 'checkbox' ? checked : value;
    setConfig((prev) => ({ ...prev, [name]: nextValue }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus('');
    setSaving(true);
    try {
      const payload = {
        ...config,
        timeoutSeconds: parseInt(String(config.timeoutSeconds || ''), 10) || 360,
      };
      await invoke('setConfig', payload);
      if (payload.secretValue) {
        setSecretConfigured(true);
        setConfig((prev) => ({ ...prev, secretValue: '' }));
      }
      setStatus('Settings saved.');
    } catch (err) {
      setStatus('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 16 }}>Loading...</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h2>FlowMe Cloud Settings</h2>
      <p>Configure the AI provider used for PNG or text to diagram features.</p>

      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label>
            <input
              type="checkbox"
              name="enabled"
              checked={Boolean(config.enabled)}
              onChange={onFieldChange}
            />
            <span style={{ marginLeft: 8 }}>Enable AI features</span>
          </label>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>AI provider</label>
          <input
            type="text"
            name="aiProvider"
            value={config.aiProvider}
            onChange={onFieldChange}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Secret ID</label>
          <input
            type="text"
            name="secretId"
            value={config.secretId}
            onChange={onFieldChange}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Secret value</label>
          <input
            type="password"
            name="secretValue"
            value={config.secretValue}
            onChange={onFieldChange}
            placeholder={secretConfigured ? 'Configured (leave blank to keep)' : 'Paste API key'}
            style={{ width: '100%' }}
          />
          <div style={{ marginTop: 6, color: secretConfigured ? '#00875a' : '#de350b' }}>
            {secretConfigured ? 'Secret is configured' : 'Secret is missing'}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Model</label>
          <input
            type="text"
            name="model"
            value={config.model}
            onChange={onFieldChange}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>API base URL</label>
          <input
            type="text"
            name="apiBaseUrl"
            value={config.apiBaseUrl}
            onChange={onFieldChange}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label>Allowed AI hosts</label>
          <input
            type="text"
            name="allowedAiHosts"
            value={config.allowedAiHosts}
            onChange={onFieldChange}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label>Timeout (seconds)</label>
          <input
            type="number"
            name="timeoutSeconds"
            value={config.timeoutSeconds}
            onChange={onFieldChange}
            style={{ width: '100%' }}
            min="0"
          />
        </div>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
        {status ? <div style={{ marginTop: 12 }}>{status}</div> : null}
      </form>
    </div>
  );
}
