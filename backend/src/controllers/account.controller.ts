import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

export const getAccounts = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId },
      include: { cards: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(accounts);
  } catch {
    res.status(500).json({ message: 'Failed to fetch accounts.' });
  }
};

export const getAccountById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const account = await prisma.account.findFirst({
      where: { id: req.params.id, userId: req.userId },
      include: { cards: true },
    });
    if (!account) {
      res.status(404).json({ message: 'Account not found.' });
      return;
    }
    res.json(account);
  } catch {
    res.status(500).json({ message: 'Failed to fetch account.' });
  }
};

export const getSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await prisma.account.findMany({
      where: { userId: req.userId },
    });

    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const accountIds = accounts.map(a => a.id);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const monthlySpent = await prisma.transaction.aggregate({
      where: {
        fromAccountId: { in: accountIds },
        type: 'DEBIT',
        status: 'COMPLETED',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    const monthlyReceived = await prisma.transaction.aggregate({
      where: {
        toAccountId: { in: accountIds },
        type: 'CREDIT',
        status: 'COMPLETED',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amount: true },
    });

    res.json({
      totalBalance,
      monthlySpent: monthlySpent._sum.amount || 0,
      monthlyReceived: monthlyReceived._sum.amount || 0,
      accountCount: accounts.length,
    });
  } catch {
    res.status(500).json({ message: 'Failed to fetch summary.' });
  }
};
