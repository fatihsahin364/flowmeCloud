import { invoke } from '@forge/bridge';

// Fetch the backend's license summary so UI can gate create actions and watermark previews.
export async function fetchLicenseStatus() {
  try {
    const res = await invoke('getLicenseStatus');
    if (!res || res.ok === false) {
      return null;
    }
    return res;
  } catch (e) {
    return null;
  }
}
