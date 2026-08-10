"use client";

import { useEffect, useState, type ReactNode } from "react";

type MotionBackdropProps = {
  open: boolean;
  className?: string;
  children: ReactNode;
  onDismiss?: () => void;
};

export default function MotionBackdrop({
  open,
  className = "modal-backdrop",
  children,
  onDismiss,
}: MotionBackdropProps) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<"opening" | "open" | "closing">(open ? "open" : "opening");

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

  if (!mounted) return null;

  return (
    <div
      className={`${className} motion-backdrop`}
      data-motion-phase={phase}
    >
      {children}
    </div>
  );
}
