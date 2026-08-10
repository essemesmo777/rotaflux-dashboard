"use client";

import { useEffect, useRef, useState } from "react";

export default function LazyFrame({
  source,
  title,
  loading = "eager",
}: {
  source: string;
  title: string;
  loading?: "eager" | "lazy";
}) {
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || frame.contentDocument?.readyState !== "complete") return;
    const checkFrame = requestAnimationFrame(() => setLoaded(true));
    return () => cancelAnimationFrame(checkFrame);
  }, [source]);

  return (
    <div className="frame-shell" data-loaded={loaded ? "true" : "false"} aria-busy={!loaded}>
      <div className="frame-skeleton" aria-hidden="true">
        <div className="frame-skeleton-sidebar">
          <span className="skeleton-block skeleton-logo" />
          {Array.from({ length: 6 }, (_, index) => <span className="skeleton-block skeleton-nav" key={index} />)}
        </div>
        <div className="frame-skeleton-main">
          <span className="skeleton-block skeleton-heading" />
          <div className="frame-skeleton-cards">
            {Array.from({ length: 4 }, (_, index) => <span className="skeleton-block skeleton-card" key={index} />)}
          </div>
          <span className="skeleton-block skeleton-panel" />
        </div>
      </div>
      <iframe
        ref={frameRef}
        className="dashboard-frame"
        src={source}
        title={title}
        loading={loading}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
