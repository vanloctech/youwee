import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface MeteorTransitionProps {
  isActive: boolean;
  oldMode: 'light' | 'dark' | null;
  onRevealStart: () => void;
  onComplete: () => void;
}

export function MeteorTransition({
  isActive,
  oldMode,
  onRevealStart,
  onComplete,
}: MeteorTransitionProps) {
  const [phase, setPhase] = useState<'idle' | 'falling' | 'impact' | 'reveal'>('idle');

  useEffect(() => {
    if (!isActive) {
      setPhase('idle');
      return;
    }

    // Phase 1: Meteor falling
    setPhase('falling');

    const impactTimer = setTimeout(() => {
      // Phase 2: Impact with screen shake
      setPhase('impact');
      document.documentElement.classList.add('screen-shake');

      setTimeout(() => {
        document.documentElement.classList.remove('screen-shake');
      }, 200);
    }, 400);

    const revealTimer = setTimeout(() => {
      // Phase 3: Theme reveal - apply new theme immediately so it shows underneath
      onRevealStart();
      setPhase('reveal');
    }, 500);

    const completeTimer = setTimeout(() => {
      setPhase('idle');
      onComplete();
    }, 1100);

    return () => {
      clearTimeout(impactTimer);
      clearTimeout(revealTimer);
      clearTimeout(completeTimer);
      document.documentElement.classList.remove('screen-shake');
    };
  }, [isActive, onRevealStart, onComplete]);

  if (!isActive && phase === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* Meteor */}
      {(phase === 'falling' || phase === 'impact') && (
        <div
          className={cn(
            'absolute w-4 h-4 rounded-full',
            'bg-gradient-to-br from-orange-400 via-yellow-300 to-white',
            'shadow-[0_0_20px_10px_rgba(251,191,36,0.6),0_0_60px_30px_rgba(251,146,60,0.4)]',
            'meteor-fall',
          )}
          style={{
            left: '50%',
            top: '-20px',
            transform: 'translateX(-50%)',
          }}
        >
          {/* Meteor tail */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-32 -translate-y-full"
            style={{
              background:
                'linear-gradient(to top, rgba(251,191,36,0.8), rgba(251,146,60,0.4), transparent)',
              filter: 'blur(2px)',
            }}
          />
        </div>
      )}

      {/* Impact flash */}
      {phase === 'impact' && (
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full animate-impact-flash"
          style={{
            background:
              'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(251,191,36,0.6) 40%, transparent 70%)',
          }}
        />
      )}

      {/* Shockwave rings */}
      {(phase === 'impact' || phase === 'reveal') && (
        <>
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40 animate-shockwave"
            style={{ width: '10px', height: '10px' }}
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 animate-shockwave"
            style={{ width: '10px', height: '10px', animationDelay: '0.1s' }}
          />
        </>
      )}

      {/* Old theme overlay that shrinks away to reveal new theme underneath */}
      {phase === 'reveal' && oldMode && (
        <div
          className={cn(
            'absolute inset-0 animate-theme-shrink',
            oldMode === 'dark' ? 'bg-[hsl(240,10%,3.9%)]' : 'bg-white',
          )}
          style={{
            clipPath: 'circle(150% at 50% 50%)',
          }}
        />
      )}
    </div>
  );
}
