import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function WeeklySubscribeCta() {
  return (
    <div className="border-line from-surface to-canvas flex flex-col items-start gap-3 rounded-2xl border bg-gradient-to-b p-6">
      <h2 className="font-heading text-ink text-lg font-semibold">
        Get the next issue in your inbox
      </h2>
      <p className="text-ink-muted text-sm">
        5–7 problems worth building, every Tuesday. Free.
      </p>
      <Button asChild className="h-12 px-6 text-base">
        <Link href="/?ref=weekly-archive#subscribe">
          Subscribe free
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
