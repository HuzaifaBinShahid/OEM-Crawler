const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function fetchPartNumber({ vin, cartName, skuQuery }) {
  const effectiveCart = (cartName && cartName.trim()) ? cartName.trim() : vin.trim();
  const res = await fetch(`${API_BASE}/api/vin-lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    fetch(`${API_BASE}/api/vin-lookup/stream?${params}`)
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
              } catch (_) {}
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, selections }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || 'Submit failed');
  return json.data;
}

export async function submitStop(jobId) {
  const res = await fetch(`${API_BASE}/api/vin-lookup/stream/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
