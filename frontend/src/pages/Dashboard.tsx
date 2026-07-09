import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Wallet, CreditCard, ArrowRight, RefreshCw } from 'lucide-react';
import { accountApi, transactionApi, cardApi } from '../api';
import type { AccountSummary, Transaction, Card, SpendingCategory } from '../types';
import TransactionRow from '../components/TransactionRow';
import CardDisplay from '../components/CardDisplay';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#EB001B', '#F79E1B', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B'];

const StatCard: React.FC<{
  icon: React.ReactNode; label: string; value: string;
  sub?: string; color?: string;
}> = ({ icon, label, value, sub, color = 'text-white' }) => (
  <div className="stat-card flex items-start gap-4">
    <div className="w-12 h-12 rounded-xl bg-mc-surface flex items-center justify-center flex-shrink-0">
      {icon}
    </div>
    <div>
      <p className="text-mc-muted text-sm">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-mc-muted mt-0.5">{sub}</p>}
    </div>
  </div>
);

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [spending, setSpending] = useState<SpendingCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [sumRes, txRes, cardRes, spendRes] = await Promise.all([
        accountApi.getSummary(),
        transactionApi.getAll({ limit: 5 }),
        cardApi.getAll(),
        transactionApi.getSpending(),
      ]);
      setSummary(sumRes.data);
      setTransactions(txRes.data.transactions);
      setCards(cardRes.data);
      setSpending(spendRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-mc-muted">
          <RefreshCw size={20} className="animate-spin" />
          Loading your financial data...
        </div>
      </div>
    );
  }

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Wallet size={22} className="text-mc-orange" />}
          label="Total Balance"
          value={fmt(summary?.totalBalance || 0)}
          sub={`Across ${summary?.accountCount || 0} accounts`}
          color="text-white"
        />
        <StatCard
          icon={<TrendingDown size={22} className="text-emerald-400" />}
          label="Monthly Income"
          value={fmt(summary?.monthlyReceived || 0)}
          sub="This month"
          color="text-emerald-400"
        />
        <StatCard
          icon={<TrendingUp size={22} className="text-mc-red" />}
          label="Monthly Spent"
          value={fmt(summary?.monthlySpent || 0)}
          sub="This month"
          color="text-mc-red"
        />
        <StatCard
          icon={<CreditCard size={22} className="text-blue-400" />}
          label="Active Cards"
          value={String(cards.filter(c => c.status === 'ACTIVE').length)}
          sub={`${cards.length} total cards`}
          color="text-blue-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-surface p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Recent Transactions</h2>
            <Link to="/transactions" className="text-mc-orange text-sm flex items-center gap-1 hover:underline">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-mc-border/50">
            {transactions.length === 0 ? (
              <p className="text-mc-muted text-sm py-8 text-center">No transactions yet</p>
            ) : (
              transactions.map(tx => <TransactionRow key={tx.id} transaction={tx} />)
            )}
          </div>
        </div>

        <div className="card-surface p-6">
          <h2 className="font-semibold text-lg mb-4">Spending by Category</h2>
          {spending.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={spending} dataKey="total" nameKey="category" cx="50%" cy="50%"
                    innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {spending.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [`$${v.toFixed(2)}`, 'Amount']}
                    contentStyle={{ backgroundColor: '#1A1A24', border: '1px solid #2A2A38', borderRadius: 12, color: '#fff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {spending.slice(0, 5).map((s, i) => (
                  <div key={s.category} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-mc-muted">{s.category}</span>
                    </div>
                    <span className="font-medium">${s.total.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-mc-muted text-sm text-center py-8">No spending data this month</p>
          )}
        </div>
      </div>

      <div className="card-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">My Cards</h2>
          <Link to="/cards" className="text-mc-orange text-sm flex items-center gap-1 hover:underline">
            Manage <ArrowRight size={14} />
          </Link>
        </div>
        <div className="flex gap-6 overflow-x-auto pb-2">
          {cards.slice(0, 2).map(card => (
            <div key={card.id} className="flex-shrink-0 w-72">
              <CardDisplay card={card} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
