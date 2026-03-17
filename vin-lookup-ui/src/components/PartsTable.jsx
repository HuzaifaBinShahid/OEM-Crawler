import { useState } from 'react';

const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

function PartsTable({ columns, data, selectColumn, suggestedPart }) {
  const [figureModalUrl, setFigureModalUrl] = useState(null);

  const isSuggested = (row) => {
    if (!suggestedPart) return false;
    const a = (row.sku || '').trim().toLowerCase();
    const b = (suggestedPart.sku || '').trim().toLowerCase();
    return a && b && a === b;
  };

  const getCellValue = (row, col) => {
    if (col.getValue) return col.getValue(row);
    const v = row[col.key];
    return v !== undefined && v !== null ? v : '—';
  };

  const renderCell = (row, col) => {
    const value = getCellValue(row, col);
    if (col.key === 'figureImageUrl' && value && typeof value === 'string' && value.startsWith('http')) {
      return (
        <button
          type="button"
          className="parts-table-figure-btn"
          onClick={() => setFigureModalUrl(value)}
          title="View figure"
          aria-label="View figure"
        >
          <EyeIcon />
        </button>
      );
    }
    if (col.key === 'figureImageUrl') return '—';
    return value ?? '—';
  };

  return (
    <div className="parts-table-wrap">
      <table className="parts-table">
        <thead>
          <tr>
            {selectColumn && <th style={{ width: 48 }}></th>}
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
            {suggestedPart && <th style={{ width: 120 }}></th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => {
            const suggested = isSuggested(row);
            const selected = selectColumn && selectColumn.isSelected(row, i);
            return (
              <tr key={i} className={suggested ? 'row-suggested-by-ai' : ''}>
                {selectColumn && (
                  <td>
                    <button
                      type="button"
                      className={`btn-tick ${selected ? 'selected' : ''}`}
                      onClick={() => selectColumn.onSelect(row, i)}
                      aria-label={selected ? 'Selected' : 'Select this part'}
                      title={selected ? 'Selected' : 'Select as correct part'}
                    >
                      ✓
                    </button>
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key}>{renderCell(row, col)}</td>
                ))}
                {suggestedPart && (
                  <td>
                    {suggested && (
                      <span className="badge-suggested-ai" title="Based on your data and queries">
                        Suggested by AI
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {figureModalUrl && (
        <div
          className="figure-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Figure image"
          onClick={() => setFigureModalUrl(null)}
        >
          <div className="figure-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="figure-modal-close"
              onClick={() => setFigureModalUrl(null)}
              aria-label="Close"
            >
              ×
            </button>
            <img src={figureModalUrl} alt="Part figure" className="figure-modal-img" />
          </div>
        </div>
      )}
    </div>
  );
}

export default PartsTable;
