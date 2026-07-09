import React, { useEffect, useState } from 'react';
import { RefreshCw, Snowflake, CheckCircle } from 'lucide-react';
import { cardApi } from '../api';
import type { Card } from '../types';
import CardDisplay from '../components/CardDisplay';

const Cards: React.FC = () => {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    cardApi.getAll()
      .then(res => setCards(res.data))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (id: string) => {
    setToggling(id);
    try {
      const res = await cardApi.toggle(id);
      setCards(prev => prev.map(c => c.id === id ? { ...c, ...res.data } : c));
    } catch (e) {
      console.error(e);
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin text-mc-muted" />
      </div>
    );
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cards.map(card => (
          <div key={card.id} className="space-y-4">
            <CardDisplay card={card} onToggle={toggling ? undefined : handleToggle} />

            <div className="card-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-mc-muted text-sm">Card Type</span>
                <span className="text-sm font-medium">{card.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-mc-muted text-sm">Account Type</span>
                <span className="text-sm font-medium">{card.account?.type || '—'}</span>
              </div>
              {card.limit && (
                <div className="flex items-center justify-between">
                  <span className="text-mc-muted text-sm">Spending Limit</span>
                  <span className="text-sm font-medium">{fmt(card.limit)}</span>
                </div>
              )}
              {card.account?.balance !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-mc-muted text-sm">Account Balance</span>
                  <span className="text-sm font-semibold text-emerald-400">{fmt(card.account.balance)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-mc-border">
                <span className="text-mc-muted text-sm">Status</span>
                <div className={`flex items-center gap-1.5 text-sm font-medium
                  ${card.status === 'ACTIVE' ? 'text-emerald-400' : 'text-blue-400'}`}>
                  {card.status === 'ACTIVE'
                    ? <><CheckCircle size={14} /> Active</>
                    : <><Snowflake size={14} /> Frozen</>
                  }
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {cards.length === 0 && (
        <div className="card-surface p-12 text-center">
          <p className="text-mc-muted">No cards found</p>
        </div>
      )}
    </div>
  );
};

export default Cards;
