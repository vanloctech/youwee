import { CheckCircle2 } from 'lucide-react';

export function ThumbnailCompletedBadge() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent">
      <div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white shadow-sm ring-1 ring-white/15 backdrop-blur-md">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
      </div>
    </div>
  );
}
