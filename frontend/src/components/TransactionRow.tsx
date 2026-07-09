import React from 'react';
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, ShoppingBag, Utensils, Plane, Tv, Heart, Zap } from 'lucide-react';
import type { Transaction } from '../types';

const categoryIcons: Record<string, React.ReactNode> = {
  'Shopping': <ShoppingBag size={16} />,
  'Food & Dining': <Utensils size={16} />,
  'Travel': <Plane size={16} />,
  'Entertainment': <Tv size={16} />,
  'Health': <Heart size={16} />,
  'Utilities': <Zap size={16} />,
};

interface TransactionRowProps {
  transaction: Transaction;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ transaction }) => {
  const isCredit = transaction.type === 'CREDIT';
  const isTransfer = transaction.type === 'TRANSFER';

  const icon = isTransfer ? <ArrowLeftRight size={16} /> : isCredit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />;
  const colorClass = isCredit ? 'text-emerald-400 bg-emerald-400/10' : isTransfer ? 'text-blue-400 bg-blue-400/10' : 'text-red-400 bg-red-400/10';
  const amountColor = isCredit ? 'text-emerald-400' : isTransfer ? 'text-blue-400' : 'text-white';
  const sign = isCredit ? '+' : isTransfer ? '↔' : '-';

  const categoryIcon = transaction.category ? categoryIcons[transaction.category] : null;

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-mc-surface/50 rounded-xl transition-colors group">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {transaction.merchant || transaction.description || 'Transaction'}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {categoryIcon && (
            <span className="text-mc-muted">{categoryIcon}</span>
          )}
          <p className="text-xs text-mc-muted truncate">{transaction.category || transaction.description || '—'}</p>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-sm font-semibold ${amountColor}`}>
          {sign}${transaction.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-mc-muted mt-0.5">
          {new Date(transaction.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      </div>
    </div>
  );
};

export default TransactionRow;
