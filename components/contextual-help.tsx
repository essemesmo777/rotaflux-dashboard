"use client";

import Link from "next/link";
import { useState } from "react";
import { getHelpArticleById, type HelpArticle } from "../lib/help-content";
import MotionBackdrop from "./motion-backdrop";

export function HelpArticleContent({ article }: { article: HelpArticle }) {
  return <>
    <p className="help-article-summary">{article.summary}</p>
    <ol className="help-step-list">
      {article.steps.map((step, index) => <li key={step.title}>
        <span aria-hidden="true">{index + 1}</span>
        <div><strong>{step.title}</strong><p>{step.description}</p></div>
      </li>)}
    </ol>
    {article.tips?.length ? <aside className="help-tips" aria-label="Dicas importantes"><strong>Dicas importantes</strong><ul>{article.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></aside> : null}
  </>;
}

export function HelpTerm({ term, description }: { term: string; description: string }) {
  return <span className="help-term">
    <span>{term}</span>
    <button className="help-term-trigger" type="button" aria-label={`${term}: ${description}`} onClick={(event) => event.preventDefault()}>?</button>
    <span className="help-tooltip" role="tooltip">{description}</span>
  </span>;
}

export default function ContextualHelp({ articleId, label = "Como usar esta tela" }: { articleId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const article = getHelpArticleById(articleId);
  if (!article) return null;

  return <>
    <button className="context-help-button" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span aria-hidden="true">?</span>{label}
    </button>
    <MotionBackdrop open={open} className="help-dialog-backdrop" onDismiss={() => setOpen(false)}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby={`context-help-${article.id}`}>
        <header className="help-dialog-header">
          <div><span className="operational-eyebrow">Ajuda contextual</span><h2 id={`context-help-${article.id}`}>{article.title}</h2></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar ajuda">×</button>
        </header>
        <HelpArticleContent article={article} />
        <footer className="help-dialog-footer">
          <button className="secondary-action" type="button" onClick={() => setOpen(false)}>Fechar</button>
          <Link className="primary-action" href={`/ajuda?artigo=${article.id}`}>Abrir guia completo</Link>
        </footer>
      </section>
    </MotionBackdrop>
  </>;
}
