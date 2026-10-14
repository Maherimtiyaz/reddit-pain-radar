"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { navLinks, site } from "@/lib/site";
import { cn } from "@/lib/utils";

const ctaHref = site.stripePaymentLink || "#waitlist";

function Logo() {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className="text-brand size-7"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="14" className="fill-surface-2" />
      <circle
        cx="16"
        cy="16"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.5"
      />
      <circle
        cx="16"
        cy="16"
        r="4.5"
        stroke="currentColor"
        strokeOpacity="0.7"
        strokeWidth="1.5"
      />
      <circle cx="16" cy="16" r="1.6" fill="currentColor" />
      <path
        d="M16 16 L26 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-300",
        scrolled || open
          ? "border-line bg-canvas/80 backdrop-blur-md"
          : "border-transparent",
      )}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <a
          href="#top"
          className="font-heading text-ink flex items-center gap-2 font-semibold tracking-tight"
        >
          <Logo />
          {site.name}
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-ink-muted hover:text-ink text-sm transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button asChild className="h-11 px-5">
            <a href={ctaHref}>Get early access</a>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="border-line text-ink flex size-11 items-center justify-center rounded-lg border md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </Container>

      {open ? (
        <div className="border-line bg-canvas/95 border-t backdrop-blur md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-ink-muted hover:bg-surface hover:text-ink rounded-lg px-3 py-3 text-base transition-colors"
              >
                {link.label}
              </a>
            ))}
            <Button asChild className="mt-3 h-12 text-base">
              <a href={ctaHref} onClick={() => setOpen(false)}>
                Get early access
              </a>
            </Button>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
