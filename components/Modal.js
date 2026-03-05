import { useEffect } from "react";

const overlayStyle = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "rgba(0,0,0,0.45)",
  overflowY: "auto",
  WebkitOverflowScrolling: "touch",
};

const cardStyle = {
  width: "100%",
  maxWidth: 420,
  maxHeight: "calc(100vh - 32px)",
  overflowY: "auto",
  background: "#ffffff",
  borderRadius: 16,
  boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
  margin: "auto",
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderBottom: "1px solid #e5e7eb",
  flexShrink: 0,
};

const closeBtnStyle = {
  width: 40,
  height: 40,
  minWidth: 40,
  minHeight: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  background: "transparent",
  borderRadius: 999,
  color: "#6b7280",
  fontSize: 20,
  cursor: "pointer",
};

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
      style={overlayStyle}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 id="modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={closeBtnStyle}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ padding: "16px 20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}
