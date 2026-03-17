const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

function getAuthHeaders() {
  if (authToken) {
    return { Authorization: `Bearer ${authToken}` };
  }
  return {};
}

function getWsBase() {
  try {
    const u = new URL(API_BASE);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return u.origin;
  } catch {
    return 'ws://localhost:3000';
  }
}

export async function login({ email, password }) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Login failed');
  return json.data;
}

export async function signup({ email, password }) {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Signup failed');
  return json.data;
}

export async function getMe() {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 401) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Request failed');
  return json.data;
}

/** Current user's lookup stats and recent records (customer/internal). */
export async function getMyStats() {
  const res = await fetch(`${API_BASE}/api/users/me/stats`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to load stats');
  return json.data;
}

/** Change current user's password. */
export async function changeMyPassword({ password }) {
  const res = await fetch(`${API_BASE}/api/users/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to update password');
  return json;
}

export async function getAdminStats() {
  const res = await fetch(`${API_BASE}/api/admin/stats`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to load stats');
  return json.data;
}

export async function getAdminUsers() {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to load users');
  return json.data;
}

export async function createInternalUser({ email, password }) {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to create user');
  return json.data;
}

export async function updateUser(id, { email, password }) {
  const res = await fetch(`${API_BASE}/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || 'Failed to update user');
  return json.data;
}

export async function deleteUser(id) {
  const res = await fetch(`${API_BASE}/api/admin/users/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok && res.status !== 204) {
    let message = 'Failed to delete user';
    try {
      const json = await res.json();
      message = json.error || json.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
}

export async function fetchPartNumber({ vin, cartName, skuQuery }) {
  const effectiveCart = (cartName && cartName.trim()) ? cartName.trim() : vin.trim();
  const res = await fetch(`${API_BASE}/api/vin-lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      vin: vin.trim(),
      cartName: effectiveCart,
      skuQuery: skuQuery.trim(),
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.message || json.error || 'Request failed');
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json.data;
}

/**
 * Fetch part number via WebSocket. Calls onStatus(message) for progress and onAwaitingSelection when parts are ready.
 * Resolves with the result data. Rejects on error message or connection failure (so browser-closed and other server errors reach the UI).
 */
export function fetchPartNumberStreamViaWs({ vin, cartName, skuQuery }, { onStatus, onAwaitingSelection }) {
  const effectiveCart = (cartName && cartName.trim()) ? cartName.trim() : vin.trim();
  const params = new URLSearchParams({
    vin: vin.trim(),
    cartName: effectiveCart,
    skuQuery: (skuQuery ?? '').trim(),
  });
  if (authToken) params.set('token', authToken);
  const wsUrl = `${getWsBase()}/api/vin-lookup/ws?${params}`;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch { /* ignore */ }
      fn(arg);
    };

    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      reject(err);
      return;
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'status' && msg.message) {
          onStatus(msg.message);
        } else if (msg.type === 'awaiting_selection' && msg.jobId != null) {
          if (onAwaitingSelection) {
            onAwaitingSelection({
              jobId: msg.jobId,
              parts: msg.parts ?? [],
              suggestedPart: msg.suggestedPart,
              partsPerTerm: msg.partsPerTerm,
            });
          }
        } else if (msg.type === 'result' && msg.data) {
          finish(resolve, msg.data);
        } else if (msg.type === 'error' && msg.message) {
          finish(reject, new Error(msg.message));
        }
      } catch { /* ignore parse */ }
    };

    ws.onerror = () => {
      finish(reject, new Error('Connection error'));
    };

    ws.onclose = (event) => {
      if (settled) return;
      if (event.code === 1000 || event.code === 1005) return;
      settled = true;
      reject(new Error(event.reason || 'Connection closed'));
    };
  });
}

/**
 * Fetch part number via SSE stream. Calls onStatus(message) for each progress message.
 * If server sends awaiting_selection, calls onAwaitingSelection({ jobId, parts }) and keeps reading until result or error.
 * Resolves with the result data. Rejects on error event or request failure.
 */
export function fetchPartNumberStream({ vin, cartName, skuQuery }, { onStatus, onAwaitingSelection }) {
  const effectiveCart = (cartName && cartName.trim()) ? cartName.trim() : vin.trim();
  const params = new URLSearchParams({
    vin: vin.trim(),
    cartName: effectiveCart,
    skuQuery: skuQuery.trim(),
  });
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/api/vin-lookup/stream?${params}`, { headers: getAuthHeaders() })
      .then((res) => {
        if (!res.ok) {
          res.json().then((json) => {
            reject(new Error(json.message || json.error || 'Request failed'));
          }).catch(() => reject(new Error('Request failed')));
          return;
        }
        if (!res.body) {
          reject(new Error('No response body'));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        function read() {
          reader.read().then(({ done, value }) => {
            if (done) {
              resolve(null);
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              try {
                const payload = JSON.parse(line.slice(6));
                if (payload.type === 'status' && payload.message) {
                  onStatus(payload.message);
                } else if (payload.type === 'awaiting_selection' && payload.jobId != null) {
                  if (onAwaitingSelection) onAwaitingSelection({ jobId: payload.jobId, parts: payload.parts ?? [], suggestedPart: payload.suggestedPart, partsPerTerm: payload.partsPerTerm });
                } else if (payload.type === 'result' && payload.data) {
                  resolve(payload.data);
                  return;
                } else if (payload.type === 'error' && payload.message) {
                  reject(new Error(payload.message));
                  return;
                }
              } catch { /* ignore parse */ }
            }
            read();
          }).catch((err) => {
            reject(err);
          });
        }
        read();
      })
      .catch(reject);
  });
}

export async function submitSelection(jobId, selectedPart, partIndex) {
  const res = await fetch(`${API_BASE}/api/vin-lookup/stream/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ jobId, selectedPart, partIndex }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Submit failed');
  return json.data;
}

/** Submit one selected part per term (multi-term flow). selections = [{ termIndex: 0, selectedPart }, { termIndex: 1, selectedPart }, ...]. */
export async function submitSelections(jobId, selections) {
  const res = await fetch(`${API_BASE}/api/vin-lookup/stream/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ jobId, selections }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Submit failed');
  return json.data;
}

export async function submitStop(jobId) {
  const res = await fetch(`${API_BASE}/api/vin-lookup/stream/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ jobId }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Stop failed');
  return json.data;
}

/**
 * Save a "part not found" result with user-edited section/subcategory.
 * Pass the full result with parts[].section (and optional subcategory in section) set; result.found will be set to true.
 */
export async function saveManualLookup({ vin, cartName, skuQuery, result }) {
  const effectiveCart = (cartName && cartName.trim()) ? cartName.trim() : vin.trim();
  const res = await fetch(`${API_BASE}/api/vin-lookup/save-manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      vin: vin.trim(),
      cartName: effectiveCart,
      skuQuery: (skuQuery ?? '').trim(),
      result,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Save failed');
  return json.data;
}
