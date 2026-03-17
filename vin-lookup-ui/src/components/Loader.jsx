function Loader({ progress = 0, message = 'Looking up parts…', showProgress = true }) {
  return (
    <div className="loader-wrap">
      {showProgress && (
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="loader">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <p className="loader-text">{message}</p>
    </div>
  );
}

export default Loader;
