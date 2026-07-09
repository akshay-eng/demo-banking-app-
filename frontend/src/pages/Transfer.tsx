import React, { useEffect, useState, useMemo } from 'react';
import { ArrowRight, CheckCircle, AlertCircle, RefreshCw, Star, Clock, User } from 'lucide-react';
import { accountApi, transactionApi } from '../api';
import type { Account, Transaction } from '../types';

const DEMO_PAYEES = [
  { label: 'James Wilson', accountNumber: '4521 8834 1290 3344', tag: 'Recommended' },
  { label: 'Sarah Chen', accountNumber: '3782 4498 5601 1002', tag: 'Recommended' },
  { label: 'Tech Corp Payroll', accountNumber: '6011 1111 1111 1117', tag: 'Recommended' },
  { label: 'City Utilities', accountNumber: '3530 1113 3330 0000', tag: 'Recommended' },
  { label: 'Landlord — Maple Apt', accountNumber: '5019 5195 0191 5195', tag: 'Recommended' },
];

interface Recipient {
  label: string;
  accountNumber: string;
  group: 'own' | 'recent' | 'recommended';
}

const Transfer: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentTx, setRecentTx] = useState<Transaction[]>([]);
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountNumber, setToAccountNumber] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingAccounts, setFetchingAccounts] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([accountApi.getAll(), transactionApi.getAll({ limit: 50 })])
      .then(([accRes, txRes]) => {
        setAccounts(accRes.data);
        if (accRes.data.length > 0) setFromAccountId(accRes.data[0].id);
        setRecentTx(txRes.data.transactions);
      })
      .finally(() => setFetchingAccounts(false));
  }, []);

  const selectedAccount = accounts.find(a => a.id === fromAccountId);

  const recipients: Recipient[] = useMemo(() => {
    const own: Recipient[] = accounts
      .filter(a => a.id !== fromAccountId)
      .map(a => ({
        label: `My ${a.type} Account`,
        accountNumber: a.accountNumber,
        group: 'own' as const,
      }));

    const seenNumbers = new Set(own.map(r => r.accountNumber));
    const recent: Recipient[] = [];
    for (const tx of recentTx) {
      if (tx.type === 'TRANSFER' && tx.toAccount?.accountNumber && !seenNumbers.has(tx.toAccount.accountNumber)) {
        seenNumbers.add(tx.toAccount.accountNumber);
        recent.push({
          label: `Recent — ${tx.toAccount.accountNumber}`,
          accountNumber: tx.toAccount.accountNumber,
          group: 'recent',
        });
        if (recent.length >= 3) break;
      }
    }

    const recommended: Recipient[] = DEMO_PAYEES
      .filter(p => !seenNumbers.has(p.accountNumber))
      .map(p => ({ label: p.label, accountNumber: p.accountNumber, group: 'recommended' as const }));

    return [...own, ...recent, ...recommended];
  }, [accounts, fromAccountId, recentTx]);

  const handleRecipientSelect = (value: string) => {
    setSelectedRecipient(value);
    if (value) setToAccountNumber(value);
  };

  const handleManualInput = (value: string) => {
    setToAccountNumber(value);
    const match = recipients.find(r => r.accountNumber === value);
    setSelectedRecipient(match ? value : '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError('Enter a valid amount.'); return; }
    if (!toAccountNumber.trim()) { setError('Select or enter a destination account number.'); return; }
    if (selectedAccount && parsedAmount > selectedAccount.balance) {
      setError('Insufficient funds in selected account.'); return;
    }

    setError('');
    setLoading(true);
    try {
      await transactionApi.transfer({
        fromAccountId,
        toAccountNumber: toAccountNumber.trim(),
        amount: parsedAmount,
        description,
      });
      setSuccess(true);
      setAmount('');
      setDescription('');
      setToAccountNumber('');
      setSelectedRecipient('');
      const res = await accountApi.getAll();
      setAccounts(res.data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Transfer failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  if (fetchingAccounts) {
    return <div className="flex justify-center py-16"><RefreshCw size={20} className="animate-spin text-mc-muted" /></div>;
  }

  const ownRecipients = recipients.filter(r => r.group === 'own');
  const recentRecipients = recipients.filter(r => r.group === 'recent');
  const recommendedRecipients = recipients.filter(r => r.group === 'recommended');

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {success && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl px-5 py-4">
          <CheckCircle size={20} />
          <div>
            <p className="font-semibold">Transfer Successful</p>
            <p className="text-sm text-emerald-400/70">Funds have been transferred.</p>
          </div>
          <button onClick={() => setSuccess(false)} className="ml-auto text-emerald-400/50 hover:text-emerald-400">✕</button>
        </div>
      )}

      <div className="card-surface p-6">
        <h2 className="font-semibold text-lg mb-6">Send Money</h2>

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 mb-4 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* From */}
          <div>
            <label className="block text-sm font-medium text-mc-muted mb-1.5">From Account</label>
            <select
              value={fromAccountId}
              onChange={e => { setFromAccountId(e.target.value); setToAccountNumber(''); setSelectedRecipient(''); }}
              className="input-field"
              required
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.type} — {acc.accountNumber} ({fmt(acc.balance)})
                </option>
              ))}
            </select>
            {selectedAccount && (
              <p className="text-xs text-mc-muted mt-1.5">
                Available: <span className="text-emerald-400 font-medium">{fmt(selectedAccount.balance)}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-center">
            <div className="flex items-center gap-3 text-mc-muted">
              <div className="h-px w-16 bg-mc-border" />
              <ArrowRight size={18} />
              <div className="h-px w-16 bg-mc-border" />
            </div>
          </div>

          {/* To — quick-pick dropdown */}
          <div>
            <label className="block text-sm font-medium text-mc-muted mb-1.5">To</label>
            <select
              value={selectedRecipient}
              onChange={e => handleRecipientSelect(e.target.value)}
              className="input-field mb-3"
            >
              <option value="">— Select a recipient —</option>

              {ownRecipients.length > 0 && (
                <optgroup label="My Accounts">
                  {ownRecipients.map(r => (
                    <option key={r.accountNumber} value={r.accountNumber}>
                      {r.label} · {r.accountNumber}
                    </option>
                  ))}
                </optgroup>
              )}

              {recentRecipients.length > 0 && (
                <optgroup label="Recent Recipients">
                  {recentRecipients.map(r => (
                    <option key={r.accountNumber} value={r.accountNumber}>
                      {r.label} · {r.accountNumber}
                    </option>
                  ))}
                </optgroup>
              )}

              {recommendedRecipients.length > 0 && (
                <optgroup label="Recommended">
                  {recommendedRecipients.map(r => (
                    <option key={r.accountNumber} value={r.accountNumber}>
                      {r.label} · {r.accountNumber}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            {/* Selected recipient preview */}
            {selectedRecipient && (() => {
              const r = recipients.find(x => x.accountNumber === selectedRecipient);
              if (!r) return null;
              const Icon = r.group === 'own' ? User : r.group === 'recent' ? Clock : Star;
              const color = r.group === 'own' ? 'text-blue-400 bg-blue-400/10' : r.group === 'recent' ? 'text-mc-orange bg-mc-orange/10' : 'text-emerald-400 bg-emerald-400/10';
              return (
                <div className="flex items-center gap-3 px-4 py-3 bg-mc-surface rounded-xl mb-3 border border-mc-border">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-mc-muted font-mono">{r.accountNumber}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedRecipient(''); setToAccountNumber(''); }}
                    className="ml-auto text-mc-muted hover:text-white text-xs"
                  >
                    ✕
                  </button>
                </div>
              );
            })()}

            {/* Manual entry fallback */}
            <div>
              <p className="text-xs text-mc-muted mb-1.5">Or enter account number manually:</p>
              <input
                type="text"
                value={toAccountNumber}
                onChange={e => handleManualInput(e.target.value)}
                className="input-field font-mono text-sm"
                placeholder="XXXX XXXX XXXX XXXX"
              />
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-mc-muted mb-1.5">Amount (USD)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-mc-muted font-medium">$</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="input-field pl-8"
                placeholder="0.00"
                min="0.01"
                step="0.01"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-mc-muted mb-1.5">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input-field"
              placeholder="e.g. Rent payment"
              maxLength={100}
            />
          </div>

          <button type="submit" disabled={loading || !toAccountNumber.trim()} className="btn-primary w-full">
            {loading ? 'Processing...' : 'Transfer Funds'}
          </button>
        </form>
      </div>

      {/* Quick-send cards */}
      <div className="card-surface p-6">
        <h3 className="font-semibold mb-4">Quick Send</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {recipients.slice(0, 6).map(r => {
            const Icon = r.group === 'own' ? User : r.group === 'recent' ? Clock : Star;
            const color = r.group === 'own' ? 'text-blue-400 bg-blue-400/10 border-blue-400/20'
              : r.group === 'recent' ? 'text-mc-orange bg-mc-orange/10 border-mc-orange/20'
              : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            const isSelected = toAccountNumber === r.accountNumber;
            return (
              <button
                key={r.accountNumber}
                type="button"
                onClick={() => handleRecipientSelect(r.accountNumber)}
                className={`flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-all
                  ${isSelected
                    ? 'bg-mc-gradient border-transparent text-white'
                    : 'bg-mc-surface border-mc-border hover:border-mc-muted'
                  }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white/20' : color}`}>
                  <Icon size={15} />
                </div>
                <div className="min-w-0 w-full">
                  <p className={`text-xs font-medium truncate ${isSelected ? 'text-white' : 'text-white'}`}>{r.label}</p>
                  <p className={`text-xs font-mono truncate ${isSelected ? 'text-white/70' : 'text-mc-muted'}`}>
                    ···· {r.accountNumber.slice(-4)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Balance summary */}
      <div className="card-surface p-6">
        <h3 className="font-semibold mb-4">Your Accounts</h3>
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc.id} className="flex items-center justify-between p-4 bg-mc-surface rounded-xl">
              <div>
                <p className="font-medium text-sm">{acc.type} Account</p>
                <p className="text-mc-muted text-xs font-mono mt-0.5">{acc.accountNumber}</p>
              </div>
              <p className="text-emerald-400 font-semibold">{fmt(acc.balance)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Transfer;
