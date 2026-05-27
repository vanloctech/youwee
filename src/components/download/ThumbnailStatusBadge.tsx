import { CheckCircle2, XCircle } from 'lucide-react';

export function ThumbnailCompletedBadge() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent">
      <div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white shadow-sm ring-1 ring-white/15 backdrop-blur-md">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
      </div>
    </div>
  );
}

export function ThumbnailFailedBadge() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/5 to-transparent">
      <div className="absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white shadow-sm ring-1 ring-white/15 backdrop-blur-md">
        <XCircle className="h-3.5 w-3.5 text-red-300" />
      </div>
    </div>
  );
}
