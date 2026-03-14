import { useState, useMemo } from 'react';

function LookupResult({ result, awaitingSelection, onSelectPart, onSelectPartForTerm, onConfirmSelections, onStop, selectedPart, selectedPartIndex, selectedPartsByTerm, suggestedPart, partsPerTerm, notFoundWithPart, onSaveManual }) {
  const [filter, setFilter] = useState('');
  const [filtersPerTerm, setFiltersPerTerm] = useState({});
  const [section, setSection] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const filteredParts = useMemo(() => {
    if (!result.parts || !result.parts.length) return [];
    if (!filter.trim()) return result.parts;
    const q = filter.trim().toLowerCase();
    return result.parts.filter(
      (p) =>
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.section && p.section.toLowerCase().includes(q)) ||
        (p.compatibility && p.compatibility.toLowerCase().includes(q))
    );
  }, [result.parts, filter]);

  const filteredPartsForTerm = (parts, termIndex) => {
    const f = filtersPerTerm[termIndex] ?? '';
    if (!f.trim()) return parts;
    const q = f.trim().toLowerCase();
    return parts.filter(
      (p) =>
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.section && p.section.toLowerCase().includes(q)) ||
        (p.compatibility && p.compatibility.toLowerCase().includes(q))
    );
  };

  if (awaitingSelection) {
    if (partsPerTerm && partsPerTerm.length > 0) {
      const isMultiTerm = partsPerTerm.length > 1;
      const allSelected = isMultiTerm && selectedPartsByTerm && Object.keys(selectedPartsByTerm).length >= partsPerTerm.length;

      return (
        <div className="result result-success result-selection">
          <h3>Select the correct part{isMultiTerm ? 's (one from each category)' : ''}</h3>
          {partsPerTerm.map((item, termIndex) => {
            const filtered = filteredPartsForTerm(item.parts, termIndex);
            const selectedForTerm = isMultiTerm ? (selectedPartsByTerm || {})[termIndex] : (selectedPartIndex === termIndex ? selectedPart : null);
            return (
              <div key={termIndex} className="parts-section">
                <h4>{item.term}</h4>
                <div className="parts-filter">
                  <input
                    type="text"
                    placeholder="Search by SKU, description, section..."
                    value={filtersPerTerm[termIndex] ?? ''}
                    onChange={(e) => setFiltersPerTerm((prev) => ({ ...prev, [termIndex]: e.target.value }))}
                    aria-label={`Filter ${item.term}`}
                  />
                </div>
                <div className="parts-table-wrap">
                  <table className="parts-table">
                    <thead>
                      <tr>
                        <th style={{ width: 48 }}></th>
                        <th>SKU</th>
                        <th>Description</th>
                        <th>Section</th>
                        <th>Compatibility</th>
                        <th style={{ width: 120 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p, i) => {
                        const isSelected = isMultiTerm
                          ? (selectedForTerm && p.sku === selectedForTerm.sku && p.description === selectedForTerm.description)
                          : (selectedPartIndex === termIndex && selectedPart && p.sku === selectedPart.sku && p.description === selectedPart.description);
                        const isSuggested = item.suggestedPart && (p.sku || '').trim().toLowerCase() === (item.suggestedPart.sku || '').trim().toLowerCase();
                        return (
                          <tr key={i} className={isSuggested ? 'row-suggested-by-ai' : ''}>
                            <td>
                              <button
                                type="button"
                                className={`btn-tick ${isSelected ? 'selected' : ''}`}
                                onClick={() => {
                                  if (isMultiTerm && onSelectPartForTerm) {
                                    onSelectPartForTerm(termIndex, p);
                                  } else if (onSelectPart) {
                                    onSelectPart(p, termIndex);
                                  }
                                }}
                                aria-label={isSelected ? 'Selected' : 'Select this part'}
                                title={isSelected ? 'Selected' : 'Select as correct part'}
                              >
                                ✓
                              </button>
                            </td>
                            <td>{p.sku ?? '—'}</td>
                            <td>{p.description ?? '—'}</td>
                            <td>{p.section ?? '—'}</td>
                            <td>{p.compatibility ?? '—'}</td>
                            <td>
                              {isSuggested && <span className="badge-suggested-ai" title="Based on your data and queries">Suggested by AI</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {isMultiTerm && (
            <div className="selection-actions">
              <button
                type="button"
                className="btn-confirm"
                disabled={!allSelected}
                onClick={onConfirmSelections}
                title={allSelected ? 'Fetch details for both selected parts' : 'Select one part from each category above'}
              >
                Confirm and fetch details
              </button>
            </div>
          )}
          {onStop && (
            <button type="button" className="btn-stop" onClick={onStop}>
              Stop / None
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="result result-success result-selection">
        <h3>Select the correct part</h3>
        <div className="parts-filter">
          <input
            type="text"
            placeholder="Search by SKU, description, section..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter parts"
          />
        </div>
        <div className="parts-table-wrap">
          <table className="parts-table">
            <thead>
              <tr>
                <th style={{ width: 48 }}></th>
                <th>SKU</th>
                <th>Description</th>
                <th>Section</th>
                <th>Compatibility</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredParts.map((p, i) => {
                const isSelected = selectedPart && p.sku === selectedPart.sku && p.description === selectedPart.description;
                const isSuggested = suggestedPart && (p.sku || '').trim().toLowerCase() === (suggestedPart.sku || '').trim().toLowerCase();
                return (
                  <tr key={i} className={isSuggested ? 'row-suggested-by-ai' : ''}>
                    <td>
                      <button
                        type="button"
                        className={`btn-tick ${isSelected ? 'selected' : ''}`}
                        onClick={() => onSelectPart && onSelectPart(p, i)}
                        aria-label={isSelected ? 'Selected' : 'Select this part'}
                        title={isSelected ? 'Selected' : 'Select as correct part'}
                      >
                        ✓
                      </button>
                    </td>
                    <td>{p.sku ?? '—'}</td>
                    <td>{p.description ?? '—'}</td>
                    <td>{p.section ?? '—'}</td>
                    <td>{p.compatibility ?? '—'}</td>
                    <td>
                      {isSuggested && <span className="badge-suggested-ai" title="Based on your data and queries">Suggested by AI</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {onStop && (
          <button type="button" className="btn-stop" onClick={onStop}>
            Stop / None
          </button>
        )}
      </div>
    );
  }

  if (notFoundWithPart && result.parts && result.parts.length > 0) {
    const part = result.parts[0];
    const handleSave = async () => {
      setSaveError(null);
      setSaving(true);
      try {
        const sectionValue = section.trim();
        const subcategoryValue = subcategory.trim();
        const sectionDisplay = subcategoryValue ? `${sectionValue} > ${subcategoryValue}` : sectionValue;
        if (!sectionDisplay) {
          setSaveError('Please enter at least Section.');
          setSaving(false);
          return;
        }
        await onSaveManual({
          ...result,
          found: true,
          parts: [{ ...part, section: sectionDisplay }],
        });
      } catch (err) {
        setSaveError(err.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="result result-not-found">
        <p className="result-not-found-message">Part was not found in the detail list for the given query.</p>
        <div className="parts-section">
          <h3>Part from search</h3>
          <table className="parts-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Section</th>
                <th>Compatibility</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{part.sku ?? '—'}</td>
                <td>{part.description ?? '—'}</td>
                <td>{part.section ?? '—'}</td>
                <td>{part.compatibility ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="save-prompt">Do you still want to save this?</p>
        <p className="save-hint">You can edit section and subcategory below.</p>
        <div className="save-manual-fields">
          <label>
            Section
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. Cab"
              aria-label="Section"
            />
          </label>
          <label>
            Subcategory
            <input
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="e.g. HVAC Control"
              aria-label="Subcategory"
            />
          </label>
        </div>
        {saveError && <p className="save-error" role="alert">{saveError}</p>}
        <button type="button" className="btn-save-manual" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  }

  return (
    <div className="result result-success">
      <div className="result-header">
        <span className="vin-badge">{result.vin}</span>
        {result.cached && <span className="cached-badge">From cache</span>}
      </div>
      {(result.model || result.engine) && (
        <div className="meta">
          {result.model && <span>Model: {result.model}</span>}
          {result.engine && <span>Engine: {result.engine}</span>}
        </div>
      )}
      {result.parts && result.parts.length > 0 && (
        <div className="parts-section">
          <h3>Parts</h3>
          <div className="parts-table-wrap">
            <table className="parts-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Description</th>
                  <th>Section</th>
                  <th>Compatibility</th>
                </tr>
              </thead>
              <tbody>
                {result.parts.map((p, i) => (
                  <tr key={i}>
                    <td>{p.sku ?? '—'}</td>
                    <td>{p.description ?? '—'}</td>
                    <td>{p.section ?? '—'}</td>
                    <td>{p.compatibility ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {result.buildSheet && result.buildSheet.length > 0 && (
        <div className="parts-section">
          <h3>Build Sheet</h3>
          <div className="parts-table-wrap">
            <table className="parts-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Part #</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {result.buildSheet.map((row, i) => (
                  <tr key={i}>
                    <td>{row.grp ?? row.unit ?? row.raw ?? (typeof row.item !== 'undefined' ? row.item : '—')}</td>
                    <td>{row.partNumber ?? (row['Part Number'] ?? '—')}</td>
                    <td>{row.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {result.responseTimeMs != null && (
        <p className="response-time">{result.responseTimeMs}ms</p>
      )}
    </div>
  );
}

export default LookupResult;
