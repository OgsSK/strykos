import React from "react";
import { useParams, Link } from "react-router-dom";
import { useStore } from "@/context/StoreProvider";
import { Button } from "@/components/ui/button";
import { PAGES } from "@/content/legal";
import ContactPage from "@/pages/Contact";

function SectionBlock({ section, index, applyBrand }) {
  return (
    <section className="mb-10" data-testid={`section-${index}`}>
      <h2 className="font-heading text-xl sm:text-2xl font-bold uppercase tracking-tight mb-4 text-ink border-b border-border pb-2">
        {applyBrand(section.title)}
      </h2>
      {section.content && (
        <p className="text-ink-soft leading-relaxed whitespace-pre-line mb-4">{applyBrand(section.content)}</p>
      )}
      {section.list && section.list.length > 0 && (
        <ul className="list-disc pl-6 space-y-2 text-ink-soft leading-relaxed mb-4">
          {section.list.map((item, i) => <li key={i}>{applyBrand(item)}</li>)}
        </ul>
      )}
      {section.subsections && section.subsections.length > 0 && (
        <div className="space-y-5 mt-4">
          {section.subsections.map((sub, i) => (
            <div key={i} className="pl-4 border-l-2 border-border">
              <h3 className="font-semibold text-ink mb-2">{applyBrand(sub.title)}</h3>
              <p className="text-ink-soft leading-relaxed whitespace-pre-line">{applyBrand(sub.content)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function StaticPage() {
  const { slug } = useParams();
  const { lang, t, applyBrand } = useStore();

  // Page contact dédiée (formulaire complet)
  if (slug === "contact") {
    return <ContactPage />;
  }

  const page = PAGES[slug];
  if (!page) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="font-heading text-2xl font-bold">404</h1>
      <Link to="/"><Button className="mt-4 rounded-none">{applyBrand("STRYKOS")}</Button></Link>
    </div>
  );
  const content = page[lang] || page.fr;

  // Pages enrichies (avec sections)
  if (content.sections && content.sections.length > 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12" data-testid={`static-page-${slug}`}>
        <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-tight mb-3">{applyBrand(content.title)}</h1>
        {content.subtitle && <p className="text-ink-soft text-base mb-3">{applyBrand(content.subtitle)}</p>}
        {content.lastUpdate && <p className="text-xs uppercase tracking-wider text-ink-muted mb-10">{content.lastUpdate}</p>}
        <div>
          {content.sections.map((s, i) => <SectionBlock key={i} section={s} index={i} applyBrand={applyBrand} />)}
        </div>
      </div>
    );
  }

  // Ancien format (body simple) — pages pas encore migrées
  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid={`static-page-${slug}`}>
      <h1 className="font-heading text-3xl sm:text-4xl font-bold uppercase tracking-tight mb-6">{applyBrand(content.title)}</h1>
      <div className="prose text-ink-soft whitespace-pre-line leading-relaxed">{applyBrand(content.body)}</div>
    </div>
  );
}