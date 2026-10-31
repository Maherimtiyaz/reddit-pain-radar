import Link from "next/link";

import { Container } from "@/components/ui/section";
import { LogoMark } from "@/components/brand/logo";
import { footer } from "@/lib/copy";
import { site } from "@/lib/site";

/** In-site routes get client-side navigation; in-page anchors stay plain links. */
function isRoute(href: string): boolean {
  return href.startsWith("/");
}

function SocialIcon({ label }: { label: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    className: "size-4",
    "aria-hidden": true,
  } as const;

  if (label === "Twitter") {
    return (
      <svg {...common}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }

  if (label === "GitHub") {
    return (
      <svg {...common}>
        <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.05-.02-2.06-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22 0 1.6-.01 2.9-.01 3.29 0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14zM7.12 20.45H3.55V9h3.57v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto bg-transparent">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <div className="font-heading text-ink flex items-center gap-2 font-semibold tracking-tight">
              <LogoMark className="text-brand size-8" />
              {site.name}
            </div>
            <p className="text-ink-muted mt-4 max-w-xs text-sm leading-relaxed">
              {footer.tagline}
            </p>
            <div className="mt-5 flex gap-3">
              {footer.social.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={item.label}
                  className="border-line text-ink-muted hover:border-brand hover:text-ink flex size-11 items-center justify-center rounded-lg border transition-colors"
                >
                  <SocialIcon label={item.label} />
                </a>
              ))}
            </div>
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
