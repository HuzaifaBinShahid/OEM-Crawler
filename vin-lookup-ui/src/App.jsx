import { useState } from 'react';

import './App.css';
import { fetchPartNumberStream, submitSelection, submitSelections, submitStop, saveManualLookup } from './api';
import Loader from './components/Loader';
import LookupForm from './components/LookupForm';
import LookupResult from './components/LookupResult';
import ErrorMessage from './components/ErrorMessage';

function App() {
  const [vin, setVin] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [cartName, setCartName] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ vin: '', query: '' });
  const [statusLog, setStatusLog] = useState([]);
  const [selectionParts, setSelectionParts] = useState(null);
  const [partsPerTerm, setPartsPerTerm] = useState(null);
  const [suggestedPart, setSuggestedPart] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [selectedPart, setSelectedPart] = useState(null);
  const [selectedPartIndex, setSelectedPartIndex] = useState(null);
  /** For multi-term: one selection per term, keyed by termIndex. */
  const [selectedPartsByTerm, setSelectedPartsByTerm] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const vinTrim = vin.trim();
    const queryTrim = query.trim();
    const errors = {
      vin: !vinTrim ? 'VIN is required' : '',
      query: !queryTrim ? 'Query is required' : '',
    };
    setFieldErrors(errors);
    if (errors.vin || errors.query) return;

    setResult(null);
    setLoading(true);
    setProgress(0);
    setStatusLog([]);
    setSelectionParts(null);
    setJobId(null);
    setSelectedPart(null);
    setSuggestedPart(null);
    setPartsPerTerm(null);
    setSelectedPartIndex(null);
    setSelectedPartsByTerm({});

    const duration = 120000;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(95, (elapsed / duration) * 95);
      setProgress(p);
    }, 120);

    try {
      const data = await fetchPartNumberStream(
        { vin, cartName, skuQuery: query },
        {
          onStatus: (message) => {
            setStatusLog((prev) => [...prev, message]);
          },
          onAwaitingSelection: ({ jobId: id, parts, suggestedPart: suggested, partsPerTerm: ppt }) => {
            setJobId(id);
            setSelectionParts(parts ?? []);
            setSuggestedPart(suggested ?? null);
            setPartsPerTerm(ppt ?? null);
          },
        }
      );
      clearInterval(interval);
      setProgress(100);
      setTimeout(() => {
        setResult(data);
        setLoading(false);
        setProgress(0);
        setStatusLog([]);
        setSelectionParts(null);
        setJobId(null);
        setSelectedPart(null);
        setSuggestedPart(null);
        setPartsPerTerm(null);
        setSelectedPartIndex(null);
        setSelectedPartsByTerm({});
      }, 300);
    } catch (err) {
      clearInterval(interval);
      setProgress(0);
      setLoading(false);
      setSelectionParts(null);
      setJobId(null);
      setSelectedPart(null);
      setSuggestedPart(null);
      setPartsPerTerm(null);
      setSelectedPartIndex(null);
      setSelectedPartsByTerm({});
      setError(err.message || 'Something went wrong');
    }
  };

  const clearFieldError = (field) => {
    setFieldErrors((prev) => ({ ...prev, [field]: '' }));
  };

  return (
    <div className={`app${(selectionParts && selectionParts.length) || (partsPerTerm && partsPerTerm.length) ? ' selection-view' : ''}`}>
      <div className="card">
        <h1 className="title">Part Number Lookup</h1>
        <p className="subtitle">Enter VIN and query (required).</p>

        <LookupForm
          vin={vin}
          cartName={cartName}
          query={query}
          loading={loading}
          vinError={fieldErrors.vin}
          queryError={fieldErrors.query}
          onVinChange={(v) => { setVin(v); clearFieldError('vin'); }}
          onCartNameChange={setCartName}
          onQueryChange={(v) => { setQuery(v); clearFieldError('query'); }}
          onSubmit={handleSubmit}
        />

        {loading && (
          <>
            <Loader
              progress={progress}
              message={statusLog.length > 0 ? statusLog[statusLog.length - 1] : ((selectionParts?.length || (partsPerTerm && partsPerTerm.length)) ? 'Select a part or stop' : 'Looking up parts…')}
            />
            {statusLog.length > 0 && (
              <ul className="status-log" aria-live="polite">
                {statusLog.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            )}
          </>
        )}

        {loading && (selectionParts?.length > 0 || (partsPerTerm && partsPerTerm.length > 0)) && (
          <LookupResult
            result={{ parts: selectionParts ?? [] }}
            partsPerTerm={partsPerTerm}
            awaitingSelection
            selectedPart={selectedPart}
            selectedPartIndex={selectedPartIndex}
            selectedPartsByTerm={selectedPartsByTerm}
            suggestedPart={suggestedPart}
            onSelectPart={(part, partIndex) => {
              setSelectedPart(part);
              setSelectedPartIndex(partIndex ?? null);
              submitSelection(jobId, part, partIndex);
            }}
            onSelectPartForTerm={(termIndex, part) => {
              setSelectedPartsByTerm((prev) => ({ ...prev, [termIndex]: part }));
            }}
            onConfirmSelections={() => {
              const selections = partsPerTerm.map((_, i) => ({ termIndex: i, selectedPart: selectedPartsByTerm[i] }));
              submitSelections(jobId, selections);
            }}
            onStop={() => submitStop(jobId)}
          />
        )}

        {error && (
          <ErrorMessage
            message={error === 'Cancelled' || error === 'Process was stopped.' ? 'Process was stopped.' : error}
          />
        )}

        {result && !loading && (
          <LookupResult
            result={result}
            notFoundWithPart={!result.found && result.parts && result.parts.length > 0}
            onSaveManual={async (updatedResult) => {
              const data = await saveManualLookup({
                vin,
                cartName,
                skuQuery: query,
                result: updatedResult,
              });
              setResult(data);
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;