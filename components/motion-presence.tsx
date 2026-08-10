"use client";

import { useEffect, useState, type ReactNode } from "react";

type MotionPresenceProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
};

export default function MotionPresence({ open, children, className = "" }: MotionPresenceProps) {
  const [lastChildren, setLastChildren] = useState(children);
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<"opening" | "open" | "closing">(open ? "open" : "opening");

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setLastChildren(children));
    return () => cancelAnimationFrame(frame);
  }, [children, open]);

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

  if (!mounted) return null;

  return <div className={`motion-presence ${className}`.trim()} data-motion-phase={phase}>{open ? children : lastChildren}</div>;
}
