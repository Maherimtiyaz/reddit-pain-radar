import { Container } from "@/components/ui/section";
import { Marquee } from "@/components/ui/marquee";
import { socialProof } from "@/lib/copy";

export function SocialProof() {
  return (
    <section className="border-line border-y py-10">
      <Container>
        <p className="text-ink-faint mb-7 text-center text-xs font-medium tracking-[0.2em] uppercase">
          {socialProof.label}
        </p>
        <Marquee>
          {socialProof.logos.map((logo) => (
            <span
              key={logo}
              className="font-heading text-ink-faint hover:text-ink-muted text-lg font-semibold tracking-tight whitespace-nowrap transition-colors md:text-xl"
            >
              {logo}
            </span>
          ))}
        </Marquee>
      </Container>
    </section>
  );
}
