import React, { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Filter } from 'lucide-react';
import { transactionApi } from '../api';
import type { Transaction } from '../types';
import TransactionRow from '../components/TransactionRow';

const TYPES = ['ALL', 'DEBIT', 'CREDIT', 'TRANSFER'];

const Transactions: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 15 };
      if (type !== 'ALL') params.type = type;
      if (search) params.search = search;
      const res = await transactionApi.getAll(params);
      setTransactions(res.data.transactions);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, type, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="card-surface p-4 flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-mc-muted" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); if (!e.target.value) { setPage(1); } }}
            placeholder="Search merchant, category..."
            className="input-field pl-9 py-2.5 text-sm"
          />
        </form>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-mc-muted" />
          <div className="flex gap-1">
            {TYPES.map(t => (
              <button
                key={t}
                onClick={() => { setType(t); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  type === t
                    ? 'bg-mc-gradient text-white'
                    : 'bg-mc-surface text-mc-muted hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-mc-border flex items-center justify-between">
          <h2 className="font-semibold">Transaction History</h2>
          <span className="text-mc-muted text-sm">{total} transactions</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw size={20} className="animate-spin text-mc-muted" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center text-mc-muted text-sm">No transactions found</div>
        ) : (
          <div className="divide-y divide-mc-border/30">
            {transactions.map(tx => <TransactionRow key={tx.id} transaction={tx} />)}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-mc-border">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="text-sm text-mc-muted hover:text-white disabled:opacity-30 transition-colors"
            >
              ← Previous
            </button>
            <span className="text-sm text-mc-muted">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="text-sm text-mc-muted hover:text-white disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Transactions;
