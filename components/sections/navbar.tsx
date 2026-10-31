"use client";

import * as React from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";
import { Container } from "@/components/ui/section";
import { navLinks, site } from "@/lib/site";
import { cn } from "@/lib/utils";

const ctaHref = "/api/checkout";

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
        "sticky top-0 z-50 transition-colors duration-300",
        scrolled &&
          "from-canvas/85 via-canvas/45 bg-gradient-to-b to-transparent",
      )}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <a
          href="#top"
          className="font-heading text-ink flex items-center gap-2 font-semibold tracking-tight"
        >
          <LogoMark className="text-brand size-8" />
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

        <div className="hidden items-center gap-4 md:flex">
          <a
            href="/login"
            className="text-ink-muted hover:text-ink text-sm transition-colors"
          >
            Sign in
          </a>
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
            <a
              href="/login"
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:bg-surface hover:text-ink rounded-lg px-3 py-3 text-base transition-colors"
            >
              Sign in
            </a>
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
