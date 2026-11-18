function Toast({ toast, closeToast }) {
  if (!toast) return null;

  return (
    <div className={`sp-toast ${toast.type}`} role="status">
      <div className="sp-toast-icon">
        {toast.type === "success" ? "✓" : "!"}
      </div>

      <div className="sp-toast-content">
        <strong>{toast.type === "success" ? "Success" : "Attention"}</strong>

        <span>{toast.message}</span>
      </div>

      <button onClick={closeToast} aria-label="Close notification">
        ×
      </button>
    </div>
  );
}

export default Toast;
