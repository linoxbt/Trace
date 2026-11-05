import { PageHero } from "./blocks";

export interface LegalSection {
  title: string;
  paras: string[];
}

/** A plain legal page: hero, then numbered sections of short paragraphs. */
export function LegalPage({ clause, title, lede, updated, sections }: { clause: string; title: string; lede: string; updated: string; sections: LegalSection[] }) {
  return (
    <>
      <PageHero clause={clause} title={title} lede={lede} />
      <section className="pb-24">
        <div className="mx-auto max-w-3xl px-5 sm:px-8">
          <p className="text-[13px] text-faint">Last updated {updated}</p>
          <ol className="mt-8 space-y-10">
            {sections.map((s, i) => (
              <li key={s.title} id={s.title.toLowerCase().replace(/[^a-z]+/g, "-")}>
                <h2 className="text-[20px] font-semibold tracking-tight">
                  <span className="num mr-2 text-faint">{i + 1}.</span>
                  {s.title}
                </h2>
                {s.paras.map((p) => (
                  <p key={p.slice(0, 40)} className="mt-3 leading-relaxed text-ink-2">
                    {p}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
