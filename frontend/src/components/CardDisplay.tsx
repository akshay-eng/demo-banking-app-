import React, { useState } from 'react';
import { Eye, EyeOff, Snowflake, Wifi } from 'lucide-react';
import type { Card } from '../types';
import MastercardChip from './MastercardChip';

interface CardDisplayProps {
  card: Card;
  onToggle?: (id: string) => void;
}

const cardGradients = [
  'from-slate-800 via-slate-700 to-slate-900',
  'from-zinc-800 via-zinc-700 to-zinc-900',
  'from-stone-800 via-stone-700 to-stone-900',
  'from-gray-800 via-gray-700 to-gray-900',
];

const CardDisplay: React.FC<CardDisplayProps> = ({ card, onToggle }) => {
  const [showDetails, setShowDetails] = useState(false);
  const gradientIndex = card.cardNumber.charCodeAt(5) % cardGradients.length;
  const gradient = cardGradients[gradientIndex];
  const isFrozen = card.status === 'FROZEN';

  const maskedNumber = showDetails
    ? card.cardNumber
    : card.cardNumber.replace(/(\d{4} \d{4} )\d{4}( \d{4})/, '$1****$2');

  return (
    <div className={`relative rounded-2xl overflow-hidden select-none ${isFrozen ? 'opacity-70' : ''}`}
      style={{ aspectRatio: '1.586/1', minWidth: 300 }}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />

      <div className="absolute inset-0 opacity-5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="absolute rounded-full border border-white"
            style={{ width: 120 + i * 40, height: 120 + i * 40, top: -20 + i * 5, right: -60 + i * 10, opacity: 0.3 }} />
        ))}
      </div>

      {isFrozen && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-900/40 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2 text-blue-200">
            <Snowflake size={32} />
            <span className="font-semibold text-sm">Card Frozen</span>
          </div>
        </div>
      )}

      <div className="relative z-20 p-6 h-full flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/50 text-xs uppercase tracking-widest">DemoBank</p>
            <p className="text-white font-semibold text-sm mt-0.5">
              {card.type === 'CREDIT' ? 'Credit Card' : card.type === 'DEBIT' ? 'Debit Card' : 'Prepaid Card'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Wifi size={18} className="text-white/70 rotate-90" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <MastercardChip />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-white font-mono text-base tracking-widest">{maskedNumber}</p>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-white/50 hover:text-white transition-colors"
            >
              {showDetails ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-white/40 text-xs uppercase tracking-widest">Card Holder</p>
              <p className="text-white font-medium text-sm">{card.cardHolder}</p>
            </div>
            <div className="text-right">
              <p className="text-white/40 text-xs uppercase tracking-widest">Expires</p>
              <p className="text-white font-medium text-sm">{card.expiryDate}</p>
            </div>
            <div className="relative w-12 h-8">
              <div className="absolute left-0 w-8 h-8 rounded-full bg-mc-red opacity-90" />
              <div className="absolute right-0 w-8 h-8 rounded-full bg-mc-orange opacity-90" />
            </div>
          </div>
        </div>
      </div>

      {onToggle && (
        <button
          onClick={() => onToggle(card.id)}
          className={`absolute top-4 right-4 z-30 px-3 py-1 rounded-lg text-xs font-medium transition-all
            ${isFrozen
              ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30'
              : 'bg-white/10 text-white/70 hover:bg-white/20 border border-white/20'
            }`}
        >
          {isFrozen ? 'Unfreeze' : 'Freeze'}
        </button>
      )}
    </div>
  );
};

export default CardDisplay;
