"use client";
import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  close,
  children,
  className = "",
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
      onCancel={close}
      onClick={(event) => {
        if (event.target === ref.current) close();
      }}
    >
      <div className="modalhead">
        <h2 id={titleId}>{title}</h2>
        <button onClick={close} aria-label="Close dialog">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
