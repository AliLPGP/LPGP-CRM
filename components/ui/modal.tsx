"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, TriangleAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ModalSize = "sm" | "md" | "lg";

const SIZE: Record<ModalSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

/**
 * App modal. Portal-rendered with a blurred veil and a rise-in panel.
 * Bottom-sheet on phones, centered card on larger screens.
 * Esc and click-outside close it; body scroll is locked while open.
 */
export function Modal({
  open,
  onClose,
  size = "md",
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  size?: ModalSize;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="modal-overlay absolute inset-0 bg-black/45 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "modal-panel relative w-full flex flex-col bg-card border shadow-2xl",
          "rounded-t-2xl sm:rounded-xl max-h-[92dvh] sm:max-h-[85dvh]",
          SIZE[size],
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalHeader({
  icon,
  title,
  description,
  onClose,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-3 border-b px-5 py-4">
      {icon ? (
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-foreground shrink-0">
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold leading-tight">{title}</h2>
        {description ? (
          <p className="text-[13px] text-muted-foreground mt-0.5">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="p-1.5 -m-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Close"
      >
        <X className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}

export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 overflow-y-auto px-5 py-4", className)}>{children}</div>;
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t bg-muted/40 px-5 py-3.5 rounded-b-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Danger-styled confirmation modal for destructive actions. */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  pending = false,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  pending?: boolean;
  error?: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="p-5">
        <div className="flex items-start gap-3.5">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive shrink-0">
            <TriangleAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight">{title}</h2>
            {description ? (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            ) : null}
            {error ? <p className="text-sm text-destructive mt-2">{error}</p> : null}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
