export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  createdAt?: string;
}

export interface Account {
  id: string;
  userId: string;
  accountNumber: string;
  type: 'CHECKING' | 'SAVINGS' | 'CREDIT';
  balance: number;
  currency: string;
  createdAt: string;
  cards?: Card[];
}

export interface Card {
  id: string;
  accountId: string;
  cardNumber: string;
  cardHolder: string;
  expiryDate: string;
  cvv: string;
  type: 'DEBIT' | 'CREDIT' | 'PREPAID';
  status: 'ACTIVE' | 'FROZEN' | 'CANCELLED';
  limit?: number;
  account?: {
    type: string;
    balance: number;
    currency: string;
  };
}

export interface Transaction {
  id: string;
  fromAccountId?: string;
  toAccountId?: string;
  amount: number;
  currency: string;
  type: 'DEBIT' | 'CREDIT' | 'TRANSFER';
  description?: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  category?: string;
  merchant?: string;
  createdAt: string;
  fromAccount?: { accountNumber: string; type: string };
  toAccount?: { accountNumber: string; type: string };
}

export interface AccountSummary {
  totalBalance: number;
  monthlySpent: number;
  monthlyReceived: number;
  accountCount: number;
}

export interface SpendingCategory {
  category: string;
  total: number;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}
