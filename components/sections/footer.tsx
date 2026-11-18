import Link from "next/link";

import { Container } from "@/components/ui/section";
import { LogoMark } from "@/components/brand/logo";
import { footer } from "@/lib/copy";
import { site } from "@/lib/site";

/** In-site routes get client-side navigation; in-page anchors stay plain links. */
function isRoute(href: string): boolean {
  return href.startsWith("/");
}

export function Footer() {
  return (
    <footer className="mt-auto bg-transparent">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="font-heading text-ink flex items-center gap-2 font-semibold tracking-tight">
              <LogoMark className="text-brand size-8" />
              {site.name}
            </div>
            <p className="text-ink-muted mt-4 max-w-xs text-sm leading-relaxed">
              {footer.tagline}
            </p>
          </div>

          {footer.columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-ink text-sm font-semibold">{column.title}</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {isRoute(link.href) ? (
                      <Link
                        href={link.href}
                        className="text-ink-muted hover:text-ink text-sm transition-colors"
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-ink-muted hover:text-ink text-sm transition-colors"
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-ink-faint mt-12 flex flex-col items-center justify-between gap-3 pt-6 text-xs sm:flex-row">
          <p>{footer.copyright}</p>
          <p>Built for founders who&rsquo;d rather ship than guess.</p>
        </div>
      </Container>
    </footer>
  );
}
