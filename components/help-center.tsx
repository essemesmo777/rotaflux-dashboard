"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AppRole } from "../lib/auth-navigation";
import {
  HELP_CATEGORIES,
  HELP_CHECKLISTS,
  getHelpArticleById,
  searchHelpArticles,
  visibleHelpArticles,
  visibleHelpFaqs,
  visibleHelpQuickActions,
  type HelpCategoryId,
} from "../lib/help-content";
import MotionBackdrop from "./motion-backdrop";
import { HelpArticleContent } from "./contextual-help";

const roleLabels: Record<AppRole, string> = {
  COMPANY_ADMIN: "Administrador da empresa",
  SUPER_ADMIN: "Super administrador",
  DRIVER: "Motorista",
};

export default function HelpCenter({ role }: { role: AppRole }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<HelpCategoryId | "all">("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const articles = useMemo(() => visibleHelpArticles(role), [role]);
  const faqs = useMemo(() => visibleHelpFaqs(role), [role]);
  const quickActions = useMemo(() => visibleHelpQuickActions(role), [role]);
  const results = useMemo(() => searchHelpArticles(role, query, category), [role, query, category]);
  const activeArticle = activeId ? getHelpArticleById(activeId) : undefined;
  const checklist = HELP_CHECKLISTS[role];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("artigo");
      if (requested && articles.some((article) => article.id === requested)) setActiveId(requested);
      try {
        const stored = JSON.parse(window.localStorage.getItem(`operbase:help-checklist:${role}`) || "[]") as unknown;
        if (Array.isArray(stored)) setCompleted(stored.filter((item): item is string => typeof item === "string"));
      } catch {
        setCompleted([]);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [articles, role]);

  function openArticle(id: string) {
    if (!articles.some((article) => article.id === id)) return;
    setActiveId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("artigo", id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  function closeArticle() {
    setActiveId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("artigo");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  function toggleChecklist(id: string) {
    const next = completed.includes(id) ? completed.filter((item) => item !== id) : [...completed, id];
    setCompleted(next);
    window.localStorage.setItem(`operbase:help-checklist:${role}`, JSON.stringify(next));
  }

  return <main className="help-page">
    <section className="help-hero">
      <div className="help-hero-copy"><span className="operational-eyebrow">Central de Ajuda · {roleLabels[role]}</span><h1>Como podemos ajudar?</h1><p>Guias baseados nas telas e permissões que você realmente usa no OperBase.</p></div>
      <label className="help-search" htmlFor="help-search"><span aria-hidden="true">⌕</span><input id="help-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Busque por operação, abastecimento, contrato…" autoComplete="off" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca">×</button>}</label>
    </section>

    <section className="help-section" aria-labelledby="help-quick-title">
      <div className="help-section-title"><div><span>Atalhos</span><h2 id="help-quick-title">O que você quer fazer?</h2></div></div>
      <div className="help-quick-grid">{quickActions.map((action) => <Link href={action.href} className="help-quick-card" key={action.id}><span aria-hidden="true">→</span><strong>{action.label}</strong><p>{action.description}</p></Link>)}</div>
    </section>

    <section className="help-onboarding" aria-labelledby="help-start-title">
      <div><span className="operational-eyebrow">Manual rápido</span><h2 id="help-start-title">Comece por aqui</h2><p>Marque os passos já conhecidos. Este checklist fica apenas neste dispositivo e não altera dados da empresa.</p><div className="help-progress" aria-label={`${completed.filter((id) => checklist.some((item) => item.id === id)).length} de ${checklist.length} passos concluídos`}><i style={{ transform: `scaleX(${completed.filter((id) => checklist.some((item) => item.id === id)).length / checklist.length})` }} /><span>{completed.filter((id) => checklist.some((item) => item.id === id)).length}/{checklist.length}</span></div></div>
      <div className="help-checklist">{checklist.map((item) => <div className={completed.includes(item.id) ? "complete" : ""} key={item.id}><button type="button" className="help-check" aria-pressed={completed.includes(item.id)} onClick={() => toggleChecklist(item.id)}><span aria-hidden="true">{completed.includes(item.id) ? "✓" : ""}</span><span className="sr-only">{completed.includes(item.id) ? "Marcar como não concluído" : "Marcar como concluído"}</span></button><button className="help-check-copy" type="button" onClick={() => openArticle(item.articleId)}><strong>{item.label}</strong><small>{item.description}</small></button></div>)}</div>
    </section>

    <section className="help-section" aria-labelledby="help-guide-title">
      <div className="help-section-title"><div><span>Guia completo</span><h2 id="help-guide-title">Encontre a orientação certa</h2></div><p aria-live="polite">{results.length} {results.length === 1 ? "artigo encontrado" : "artigos encontrados"}</p></div>
      <div className="help-category-tabs" role="group" aria-label="Filtrar por categoria"><button type="button" aria-pressed={category === "all"} className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>Todos <span>{articles.length}</span></button>{HELP_CATEGORIES.map((item) => {
        const count = articles.filter((article) => article.category === item.id).length;
        return count ? <button type="button" aria-pressed={category === item.id} className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)} key={item.id}>{item.label} <span>{count}</span></button> : null;
      })}</div>
      {results.length ? <div className="help-article-grid">{results.map((article) => <button className="help-article-card" type="button" onClick={() => openArticle(article.id)} key={article.id}><span>{HELP_CATEGORIES.find((item) => item.id === article.category)?.label}</span><strong>{article.title}</strong><p>{article.summary}</p><small>Ver passo a passo <i aria-hidden="true">→</i></small></button>)}</div> : <div className="help-empty" role="status"><span aria-hidden="true">⌕</span><strong>Nenhum artigo encontrado</strong><p>Tente termos mais curtos ou selecione “Todos”.</p><button className="secondary-action" type="button" onClick={() => { setQuery(""); setCategory("all"); }}>Limpar filtros</button></div>}
    </section>

    <section className="help-section help-faq-section" aria-labelledby="help-faq-title">
      <div className="help-section-title"><div><span>Dúvidas frequentes</span><h2 id="help-faq-title">FAQ</h2></div></div>
      <div className="help-faq-list">{faqs.map((faq) => <details key={faq.id}><summary>{faq.question}<span aria-hidden="true">+</span></summary><p>{faq.answer}</p>{faq.articleId && <button type="button" onClick={() => openArticle(faq.articleId!)}>Ver orientação completa →</button>}</details>)}</div>
    </section>

    <MotionBackdrop open={Boolean(activeArticle)} className="help-dialog-backdrop" onDismiss={closeArticle}>
      {activeArticle ? <section className="help-dialog help-article-dialog" role="dialog" aria-modal="true" aria-labelledby={`help-article-${activeArticle.id}`}>
        <header className="help-dialog-header"><div><span className="operational-eyebrow">{HELP_CATEGORIES.find((item) => item.id === activeArticle.category)?.label}</span><h2 id={`help-article-${activeArticle.id}`}>{activeArticle.title}</h2></div><button type="button" onClick={closeArticle} aria-label="Fechar artigo">×</button></header>
        <HelpArticleContent article={activeArticle} />
        {activeArticle.relatedIds?.some((id) => articles.some((article) => article.id === id)) ? <aside className="help-related"><strong>Continue aprendendo</strong><div>{activeArticle.relatedIds.filter((id) => articles.some((article) => article.id === id)).map((id) => <button type="button" onClick={() => openArticle(id)} key={id}>{getHelpArticleById(id)?.title} <span aria-hidden="true">→</span></button>)}</div></aside> : null}
        <footer className="help-dialog-footer"><button className="secondary-action" type="button" onClick={closeArticle}>Fechar</button>{activeArticle.path && <Link className="primary-action" href={activeArticle.path}>{activeArticle.pathLabel || "Abrir tela"}</Link>}</footer>
      </section> : <span />}
    </MotionBackdrop>
  </main>;
}
