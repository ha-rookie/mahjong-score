import type { PropsWithChildren, ReactNode } from "react";

interface SectionProps extends PropsWithChildren {
  readonly title: string;
  readonly eyebrow?: string;
  readonly action?: ReactNode;
}

export function Section({ title, eyebrow, action, children }: SectionProps) {
  return (
    <section className="section">
      <div className="section__heading">
        <div>
          {eyebrow ? <p className="section__eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? <div className="section__action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
