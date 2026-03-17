import { useState, useMemo } from 'react';
import PartsTable from './PartsTable';

const PARTS_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'description', label: 'Description' },
  { key: 'section', label: 'Section' },
  { key: 'compatibility', label: 'Compatibility' },
  { key: 'figureImageUrl', label: 'Figure', getValue: (row) => row.figureImageUrl },
];

const BUILD_SHEET_COLUMNS = [
  { key: 'item', label: 'Item', getValue: (row) => row.grp ?? row.unit ?? row.raw ?? (typeof row.item !== 'undefined' ? row.item : '—') },
  { key: 'partNumber', label: 'Part #', getValue: (row) => row.partNumber ?? row['Part Number'] ?? '—' },
  { key: 'description', label: 'Description' },
];

function LookupResult({ result, awaitingSelection, onSelectPart, onSelectPartForTerm, onConfirmSelections, onStop, selectedPart, selectedPartIndex, selectedPartsByTerm, suggestedPart, partsPerTerm, notFoundWithPart, onSaveManual }) {
  const [filter, setFilter] = useState('');
  const [filtersPerTerm, setFiltersPerTerm] = useState({});
  const [showOnlySuggested, setShowOnlySuggested] = useState(false);
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

  /** Sort so AI-suggested part(s) appear at the top. */
  const sortWithSuggestedFirst = (list, suggested) => {
    if (!list?.length || !suggested?.sku) return list;
    const key = (suggested.sku || '').trim().toLowerCase();
    const suggestedItems = list.filter((p) => (p.sku || '').trim().toLowerCase() === key);
    const rest = list.filter((p) => (p.sku || '').trim().toLowerCase() !== key);
    return [...suggestedItems, ...rest];
  };

  if (awaitingSelection) {
    if (partsPerTerm && partsPerTerm.length > 0) {
      const isMultiTerm = partsPerTerm.length > 1;
      const allSelected = isMultiTerm && selectedPartsByTerm && Object.keys(selectedPartsByTerm).length >= partsPerTerm.length;

      const hasAnySuggested = partsPerTerm.some((item) => item.suggestedPart);
      return (
        <div className="result result-success result-selection result-selection-layout">
          <div className="result-selection-header">
            <h3>Select the correct part{isMultiTerm ? 's (one from each category)' : ''}</h3>
            {hasAnySuggested && (
              <button
                type="button"
                className={`btn-suggested-only ${showOnlySuggested ? 'active' : ''}`}
                onClick={() => setShowOnlySuggested((v) => !v)}
              >
                {showOnlySuggested ? 'Show all' : 'Show only AI suggested'}
              </button>
            )}
          </div>
          <div className="result-selection-body">
            {partsPerTerm.map((item, termIndex) => {
              let filtered = filteredPartsForTerm(item.parts, termIndex);
              if (showOnlySuggested && item.suggestedPart) {
                const sku = (item.suggestedPart.sku || '').trim().toLowerCase();
                filtered = filtered.filter((p) => (p.sku || '').trim().toLowerCase() === sku);
              }
              filtered = sortWithSuggestedFirst(filtered, item.suggestedPart);
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
                  <PartsTable
                    columns={PARTS_COLUMNS}
                    data={filtered}
                    selectColumn={{
                      isSelected: (row) => selectedForTerm && row.sku === selectedForTerm.sku && row.description === selectedForTerm.description,
                      onSelect: (row) => {
                        if (isMultiTerm && onSelectPartForTerm) onSelectPartForTerm(termIndex, row);
                        else if (onSelectPart) onSelectPart(row, termIndex);
                      },
                    }}
                    suggestedPart={item.suggestedPart}
                  />
                </div>
              );
            })}
          </div>
          <div className="result-selection-footer">
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
        </div>
      );
    }
    const singleData = sortWithSuggestedFirst(
      showOnlySuggested && suggestedPart
        ? filteredParts.filter((p) => (p.sku || '').trim().toLowerCase() === (suggestedPart.sku || '').trim().toLowerCase())
        : filteredParts,
      suggestedPart
    );
    return (
      <div className="result result-success result-selection result-selection-layout">
        <div className="result-selection-header">
          <h3>Select the correct part</h3>
          {suggestedPart && (
            <button
              type="button"
              className={`btn-suggested-only ${showOnlySuggested ? 'active' : ''}`}
              onClick={() => setShowOnlySuggested((v) => !v)}
            >
              {showOnlySuggested ? 'Show all' : 'Show only AI suggested'}
            </button>
          )}
          <div className="parts-filter">
            <input
              type="text"
              placeholder="Search by SKU, description, section..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="Filter parts"
            />
          </div>
        </div>
        <div className="result-selection-body">
          <PartsTable
            columns={PARTS_COLUMNS}
            data={singleData}
            selectColumn={{
              isSelected: (row) => selectedPart && row.sku === selectedPart.sku && row.description === selectedPart.description,
              onSelect: (row, i) => onSelectPart && onSelectPart(row, i),
            }}
            suggestedPart={suggestedPart}
          />
        </div>
        <div className="result-selection-footer">
          {onStop && (
            <button type="button" className="btn-stop" onClick={onStop}>
              Stop / None
            </button>
          )}
        </div>
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
          <PartsTable columns={PARTS_COLUMNS} data={[part]} />
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
          <PartsTable columns={PARTS_COLUMNS} data={result.parts} />
        </div>
      )}
      {result.buildSheet && result.buildSheet.length > 0 && (
        <div className="parts-section">
          <h3>Build Sheet</h3>
          <PartsTable columns={BUILD_SHEET_COLUMNS} data={result.buildSheet} />
        </div>
      )}
      {result.responseTimeMs != null && (
        <p className="response-time">{result.responseTimeMs}ms</p>
      )}
    </div>
  );
}

export default LookupResult;
