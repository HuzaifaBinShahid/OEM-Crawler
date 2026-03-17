export default function AuthButton({ type = 'submit', disabled, loading, loadingLabel = 'Please wait…', children }) {
  return (
    <button type={type} className="btn auth-btn" disabled={disabled || loading}>
      {loading ? loadingLabel : children}
    </button>
  );
}
