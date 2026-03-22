import { useEffect } from "react";

export default function Modal({ title, open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="rs-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="rs-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="rs-modal-header">
          <h2 id="modal-title" className="rs-modal-title">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rs-modal-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="rs-modal-body">{children}</div>
      </div>
    </div>
  );
}
