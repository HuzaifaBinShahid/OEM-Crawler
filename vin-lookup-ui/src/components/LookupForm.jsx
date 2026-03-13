function LookupForm({
  vin,
  cartName,
  query,
  loading,
  vinError,
  queryError,
  onVinChange,
  onCartNameChange,
  onQueryChange,
  onSubmit,
}) {
  return (
    <form onSubmit={onSubmit} className="form">
      <div className={`field ${vinError ? 'has-error' : ''}`}>
        <label htmlFor="vin">VIN Number</label>
        <input
          id="vin"
          type="text"
          value={vin}
          onChange={(e) => onVinChange(e.target.value)}
          placeholder="e.g. 1HGBH41JXMN109186"
          disabled={loading}
          autoComplete="off"
          aria-invalid={!!vinError}
          aria-describedby={vinError ? 'vin-error' : undefined}
        />
        {vinError && (
          <span id="vin-error" className="field-error" role="alert">
            {vinError}
          </span>
        )}
      </div>
      {/* <div className="field">
        <label htmlFor="cart">Cart Name</label>
        <input
          id="cart"
          type="text"
          value={cartName}
          onChange={(e) => onCartNameChange(e.target.value)}
          placeholder="Leave empty to use VIN value"
          disabled={loading}
          autoComplete="off"
        />
      </div> */}
      <div className={`field ${queryError ? 'has-error' : ''}`}>
        <label htmlFor="query">Query</label>
        <input
          id="query"
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="e.g. steering, brake"
          disabled={loading}
          autoComplete="off"
          aria-invalid={!!queryError}
          aria-describedby={queryError ? 'query-error' : undefined}
        />
        {queryError && (
          <span id="query-error" className="field-error" role="alert">
            {queryError}
          </span>
        )}
      </div>
      <button type="submit" className="btn" disabled={loading}>
        Fetch Part Number
      </button>
    </form>
  );
}

export default LookupForm;
