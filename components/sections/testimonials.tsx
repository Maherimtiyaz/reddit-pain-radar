import { AnimatedTestimonials } from "@/components/ui/animated-testimonials";
import { Container, Section, SectionHeading } from "@/components/ui/section";
import { testimonials } from "@/lib/copy";

export function Testimonials() {
  return (
    <Section id="testimonials">
      <Container>
        <SectionHeading
          eyebrow="Loved by builders"
          title={testimonials.title}
          subtitle={testimonials.subtitle}
        />
        <div className="mt-14">
          <AnimatedTestimonials items={testimonials.items} />
        </div>
      </Container>
    </Section>
  );
}
