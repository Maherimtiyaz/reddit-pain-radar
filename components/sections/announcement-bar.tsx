import { Sparkles } from "lucide-react";

import { Container } from "@/components/ui/section";
import { announcement } from "@/lib/copy";

export function AnnouncementBar() {
  return (
    <div className="border-line bg-surface/60 border-b backdrop-blur">
      <Container className="text-ink-muted flex items-center justify-center gap-2 py-2 text-center text-xs md:text-sm">
        <Sparkles
          className="text-urgency size-3.5 shrink-0"
          aria-hidden="true"
        />
        <span>{announcement}</span>
      </Container>
    </div>
  );
}
