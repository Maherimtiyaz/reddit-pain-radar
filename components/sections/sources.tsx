import { Container } from "@/components/ui/section";
import { sources } from "@/lib/copy";
import { cn } from "@/lib/utils";

export function Sources() {
  return (
    <section className="border-line border-y py-10">
      <Container className="flex flex-col items-center gap-6">
        <p className="text-ink-faint text-center text-xs font-medium tracking-[0.2em] uppercase">
          {sources.label}
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {sources.items.map((item) => (
            <li
              key={item.name}
              className={cn(
                "font-heading flex items-center gap-2 text-lg font-semibold tracking-tight md:text-xl",
                item.status === "live" ? "text-ink-muted" : "text-ink-faint",
              )}
            >
              {item.name}
              {item.status === "soon" ? (
                <span className="border-line text-ink-faint rounded-full border px-2 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase">
                  Soon
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-ink-faint text-center text-xs">{sources.footnote}</p>
      </Container>
    </section>
  );
}
