"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

type MotionBackdropProps = {
  open: boolean;
  className?: string;
  children: ReactNode;
  onDismiss?: () => void;
  dismissOnBackdrop?: boolean;
};

let bodyLockCount = 0;
let previousBodyOverflow = "";
let previousBodyPaddingRight = "";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function MotionBackdrop({
  open,
  className = "modal-backdrop",
  children,
  onDismiss,
  dismissOnBackdrop = false,
}: MotionBackdropProps) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<"opening" | "open" | "closing">(open ? "open" : "opening");
  const backdropRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      let enterFrame = 0;
      const mountFrame = requestAnimationFrame(() => {
        setMounted(true);
        setPhase("opening");
        enterFrame = requestAnimationFrame(() => setPhase("open"));
      });
      return () => {
        cancelAnimationFrame(mountFrame);
        cancelAnimationFrame(enterFrame);
      };
    }

    if (!mounted) return;
    const exitFrame = requestAnimationFrame(() => setPhase("closing"));
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 140;
    const timer = window.setTimeout(() => setMounted(false), duration);
    return () => {
      cancelAnimationFrame(exitFrame);
      window.clearTimeout(timer);
    };
  }, [mounted, open]);

  useEffect(() => {
    if (!open || !onDismiss) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onDismiss, open]);

  useEffect(() => {
    if (!mounted) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (bodyLockCount === 0) {
      previousBodyOverflow = document.body.style.overflow;
      previousBodyPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    bodyLockCount += 1;
    const focusFrame = requestAnimationFrame(() => {
      const preferred = backdropRef.current?.querySelector<HTMLElement>("[autofocus]")
        ?? backdropRef.current?.querySelector<HTMLElement>(focusableSelector);
      preferred?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(focusFrame);
      bodyLockCount = Math.max(0, bodyLockCount - 1);
      if (bodyLockCount === 0) {
        document.body.style.overflow = previousBodyOverflow;
        document.body.style.paddingRight = previousBodyPaddingRight;
      }
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [mounted]);

  function trapFocus(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const focusable = [...(backdropRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [])];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function dismissFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (dismissOnBackdrop && event.target === event.currentTarget) onDismiss?.();
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={backdropRef}
      className={`${className} motion-backdrop`}
      data-motion-phase={phase}
      role="presentation"
      onKeyDown={trapFocus}
      onMouseDown={dismissFromBackdrop}
    >
      {children}
    </div>,
    document.body,
  );
}
