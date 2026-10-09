import React, { useState, useEffect } from 'react';
import { Clock, ShieldAlert, Zap } from 'lucide-react';

interface LiveCountdownProps {
  targetDate: string | Date;
  startDate?: string | Date;
  onExpire?: () => void;
  compact?: boolean;
  closeTimeLabel?: string;
}

export const LiveCountdown: React.FC<LiveCountdownProps> = ({
  targetDate,
  startDate,
  onExpire,
  compact = false,
  closeTimeLabel = '22h00',
}) => {
  const [phase, setPhase] = useState<'BEFORE_OPEN' | 'LIVE' | 'ENDED'>('LIVE');
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    totalMs: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 });

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date().getTime();
      const start = startDate ? new Date(startDate).getTime() : 0;
      const target = new Date(targetDate).getTime();

      if (start > 0 && now < start) {
        // AVANT 10h00
        setPhase('BEFORE_OPEN');
        const diff = Math.max(0, start - now);
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ days, hours, minutes, seconds, totalMs: diff });
      } else if (now < target) {
        // ENTRE 10h00 et 22h00
        setPhase('LIVE');
        const diff = Math.max(0, target - now);
        if (diff === 0 && onExpire) {
          onExpire();
        }
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft({ days, hours, minutes, seconds, totalMs: diff });
      } else {
        // À partir de 22h00
        setPhase('ENDED');
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 });
        if (onExpire) {
          onExpire();
        }
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [targetDate, startDate]);

  const isCritical = phase === 'LIVE' && timeLeft.totalMs > 0 && timeLeft.totalMs < 15 * 60 * 1000; // moins de 15 minutes
  const isAntiSnipeWindow = phase === 'LIVE' && timeLeft.totalMs > 0 && timeLeft.totalMs <= 2 * 60 * 1000; // 2 minutes

  const pad = (n: number) => String(n).padStart(2, '0');

  if (compact) {
    if (phase === 'ENDED' || timeLeft.totalMs <= 0) {
      return <span className="text-slate-400 font-medium">Vente terminée</span>;
    }
    if (phase === 'BEFORE_OPEN') {
      return (
        <span className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded font-semibold bg-slate-800 text-amber-300">
          <Clock className="w-3 h-3" />
          Ouverture dans {timeLeft.days > 0 ? `${timeLeft.days}j ` : ''}
          {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded font-semibold ${
          isCritical
            ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50 animate-pulse'
            : 'bg-slate-800 text-amber-300'
        }`}
      >
        <Clock className="w-3 h-3" />
        {timeLeft.days > 0 ? `${timeLeft.days}j ` : ''}
        {pad(timeLeft.hours)}:{pad(timeLeft.minutes)}:{pad(timeLeft.seconds)}
      </span>
    );
  }

  if (phase === 'ENDED' || (phase === 'LIVE' && timeLeft.totalMs <= 0)) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-center">
        <span className="text-slate-400 font-serif font-medium uppercase tracking-wider text-sm">
          Vente terminée
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isCritical
          ? 'bg-rose-950/30 border-rose-500/60 shadow-lg shadow-rose-950/40'
          : 'bg-[#1C2541]/80 border-[#D4AF37]/30 shadow-md'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest font-semibold text-amber-300">
          <Clock className="w-3.5 h-3.5" />
          <span>
            {phase === 'BEFORE_OPEN'
              ? 'Ouverture dans...'
              : `Vente en cours — clôture à ${closeTimeLabel}`}
          </span>
        </div>
        {phase === 'LIVE' && isAntiSnipeWindow ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-500/40 animate-bounce">
            <Zap className="w-3 h-3" />
            FENÊTRE ANTI-SNIPE ACTIVE (+2 min si surenchère)
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-4 gap-2 text-center font-mono">
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-lg p-2">
          <span className="block text-2xl sm:text-3xl font-bold text-amber-200">
            {pad(timeLeft.days)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">
            Jours
          </span>
        </div>
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-lg p-2">
          <span className="block text-2xl sm:text-3xl font-bold text-amber-200">
            {pad(timeLeft.hours)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">
            Heures
          </span>
        </div>
        <div className="bg-[#0B132B] border border-slate-700/80 rounded-lg p-2">
          <span className="block text-2xl sm:text-3xl font-bold text-amber-200">
            {pad(timeLeft.minutes)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">
            Minutes
          </span>
        </div>
        <div
          className={`border rounded-lg p-2 ${
            isCritical
              ? 'bg-rose-900/40 border-rose-500/80 text-rose-300 animate-pulse'
              : 'bg-[#0B132B] border-slate-700/80 text-amber-200'
          }`}
        >
          <span className="block text-2xl sm:text-3xl font-bold">
            {pad(timeLeft.seconds)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-sans">
            Secondes
          </span>
        </div>
      </div>
    </div>
  );
};
