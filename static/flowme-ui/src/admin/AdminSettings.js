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

const AI_PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'azure-openai', label: 'Azure OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'aws-bedrock', label: 'AWS Bedrock' },
  { value: 'cohere', label: 'Cohere' },
  { value: 'custom', label: 'Custom (Future)' },
];

export default function AdminSettings() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('ai');

  useEffect(() => {
    (async () => {
      try {
        const stored = await invoke('getConfig');
        if (stored && stored.ok === false) {
          setStatus(stored.error || 'Admin access required.');
          return;
        }
        if (stored && typeof stored === 'object') {
          setConfig({
            ...DEFAULT_CONFIG,
            ...stored,
            secretValue: '',
            timeoutSeconds: stored.timeoutSeconds ? String(stored.timeoutSeconds) : '360',
          });
          setSecretConfigured(Boolean(stored.secretConfigured));
        }
      } catch (e) {
        setStatus('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    // Load the marketplace license snapshot so admins can confirm behavior.
    let alive = true;
    (async () => {
      setLicenseLoading(true);
      try {
        const data = await invoke('getLicenseStatus');
        if (alive) {
          setLicenseStatus(data && data.ok ? data : null);
        }
      } catch (e) {
        if (alive) {
          setLicenseStatus(null);
        }
      } finally {
        if (alive) {
          setLicenseLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
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
      const res = await invoke('setConfig', payload);
      if (res && res.ok === false) {
        setStatus(res.error || 'Admin access required.');
        return;
      }
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

  const refreshLicense = async () => {
    // Force a server-side re-check to pick up freshly installed license states.
    setLicenseLoading(true);
    try {
      const data = await invoke('refreshLicenseStatus');
      if (data && data.ok === false) {
        setStatus(data.error || 'Admin access required.');
        return;
      }
      setLicenseStatus(data && data.ok ? data : null);
    } catch (e) {
      setLicenseStatus(null);
    } finally {
      setLicenseLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 16 }}>Loading...</div>;
  }

  const formatDate = (value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.valueOf())) return '';
    return date.toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formattedGraceUntil = licenseStatus && licenseStatus.graceUntil
    ? formatDate(licenseStatus.graceUntil)
    : '';
  const formattedUnlicensedSince = licenseStatus && licenseStatus.unlicensedSince
    ? formatDate(licenseStatus.unlicensedSince)
    : '';
  const formattedCheckedAt = licenseStatus && licenseStatus.checkedAt
    ? formatDate(licenseStatus.checkedAt)
    : '';
  const licenseMeta = licenseStatus && licenseStatus.license ? licenseStatus.license : null;
  const licenseMaxUsers = licenseMeta && licenseMeta.maximumUsers ? licenseMeta.maximumUsers : '';
  const purchaseDate = licenseMeta && licenseMeta.purchaseDate ? formatDate(licenseMeta.purchaseDate) : '';
  const subscriptionEndDate =
    licenseMeta && licenseMeta.subscriptionEndDate ? formatDate(licenseMeta.subscriptionEndDate) : '';
  const maintenanceEndDate =
    licenseMeta && licenseMeta.maintenanceEndDate ? formatDate(licenseMeta.maintenanceEndDate) : '';

  return (
    <div style={{ padding: 24, maxWidth: 760 }}>
      <h2>FlowMe Cloud Settings</h2>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: activeTab === 'ai' ? '1px solid #0052cc' : '1px solid #dfe1e6',
            background: activeTab === 'ai' ? '#deebff' : '#ffffff',
            color: '#172b4d',
            cursor: 'pointer',
          }}
        >
          AI settings
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('license')}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: activeTab === 'license' ? '1px solid #0052cc' : '1px solid #dfe1e6',
            background: activeTab === 'license' ? '#deebff' : '#ffffff',
            color: '#172b4d',
            cursor: 'pointer',
          }}
        >
          License
        </button>
      </div>

      {activeTab === 'license' ? (
        <div style={{ marginBottom: 20, padding: 12, border: '1px solid #dfe1e6', borderRadius: 6 }}>
          <p style={{ marginTop: 0 }}>
            Review the current Marketplace license state and refresh cached values after testing.
          </p>
          <h3 style={{ marginTop: 0 }}>License status</h3>
          {licenseStatus ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div>
                <strong>Status:</strong> {licenseStatus.status || 'unknown'}
              </div>
              <div>
                <strong>Watermark:</strong>{' '}
                {licenseStatus.watermarkEnabled ? 'Enabled' : 'Disabled'}
              </div>
              <div>
                <strong>Create new diagrams:</strong>{' '}
                {licenseStatus.allowCreateNew ? 'Allowed' : 'Disabled'}
              </div>
              {formattedUnlicensedSince ? (
                <div>
                  <strong>Unlicensed since:</strong> {formattedUnlicensedSince}
                </div>
              ) : null}
              {formattedGraceUntil ? (
                <div>
                  <strong>Grace until:</strong> {formattedGraceUntil}
                </div>
              ) : null}
              {licenseMaxUsers ? (
                <div>
                  <strong>Licensed users (max):</strong> {licenseMaxUsers}
                </div>
              ) : null}
              {purchaseDate ? (
                <div>
                  <strong>Purchase date:</strong> {purchaseDate}
                </div>
              ) : null}
              {subscriptionEndDate ? (
                <div>
                  <strong>Subscription end:</strong> {subscriptionEndDate}
                </div>
              ) : null}
              {maintenanceEndDate ? (
                <div>
                  <strong>Maintenance end:</strong> {maintenanceEndDate}
                </div>
              ) : null}
              {licenseStatus.message ? (
                <div style={{ color: '#6b778c' }}>{licenseStatus.message}</div>
              ) : null}
              {formattedCheckedAt ? (
                <div style={{ color: '#6b778c' }}>
                  Last checked: {formattedCheckedAt}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ color: '#6b778c' }}>
              {licenseLoading ? 'Checking license…' : 'License status unavailable.'}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            <button type="button" onClick={refreshLicense} disabled={licenseLoading}>
              {licenseLoading ? 'Refreshing…' : 'Refresh license cache'}
            </button>
          </div>
        </div>
      ) : null}

      {activeTab === 'ai' ? (
        <form onSubmit={onSubmit}>
        <p style={{ marginTop: 0 }}>
          Configure the AI provider used for PNG or text to diagram features.
        </p>
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
          <select
            name="aiProvider"
            value={config.aiProvider}
            onChange={onFieldChange}
            style={{ width: '100%' }}
          >
            {AI_PROVIDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, color: '#6b778c' }}>
            Only OpenAI is supported right now.
          </div>
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
      ) : null}
    </div>
  );
}
