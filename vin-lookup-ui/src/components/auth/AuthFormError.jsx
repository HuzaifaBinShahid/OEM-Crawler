export default function AuthFormError({ message }) {
  if (!message) return null;
  return (
    <p className="auth-error auth-form-error" role="alert">
      {message}
    </p>
  );
}
