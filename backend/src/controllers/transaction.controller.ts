import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

export const getTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
    const accountIds = accounts.map(a => a.id);

    const { page = '1', limit = '20', type, search } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {
      OR: [
        { fromAccountId: { in: accountIds } },
        { toAccountId: { in: accountIds } },
      ],
    };
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { merchant: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
        include: {
          fromAccount: { select: { accountNumber: true, type: true } },
          toAccount: { select: { accountNumber: true, type: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch {
    res.status(500).json({ message: 'Failed to fetch transactions.' });
  }
};

export const createTransfer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { fromAccountId, toAccountNumber, amount, description } = req.body;

    const fromAccount = await prisma.account.findFirst({ where: { id: fromAccountId, userId: req.userId } });
    if (!fromAccount) {
      res.status(404).json({ message: 'Source account not found.' });
      return;
    }
    if (fromAccount.balance < amount) {
      res.status(400).json({ message: 'Insufficient funds.' });
      return;
    }

    const toAccount = await prisma.account.findUnique({ where: { accountNumber: toAccountNumber } });

    let transaction;
    if (toAccount) {
      // Internal transfer — debit source, credit destination
      const [, , tx] = await prisma.$transaction([
        prisma.account.update({ where: { id: fromAccount.id }, data: { balance: { decrement: amount } } }),
        prisma.account.update({ where: { id: toAccount.id }, data: { balance: { increment: amount } } }),
        prisma.transaction.create({
          data: {
            id: uuidv4(),
            fromAccountId: fromAccount.id,
            toAccountId: toAccount.id,
            amount,
            currency: 'USD',
            type: 'TRANSFER',
            description: description || 'Bank Transfer',
            status: 'COMPLETED',
            category: 'Transfer',
          },
        }),
      ]);
      transaction = tx;
    } else {
      // External transfer — debit source only, record destination number in description
      const [, tx] = await prisma.$transaction([
        prisma.account.update({ where: { id: fromAccount.id }, data: { balance: { decrement: amount } } }),
        prisma.transaction.create({
          data: {
            id: uuidv4(),
            fromAccountId: fromAccount.id,
            toAccountId: null,
            amount,
            currency: 'USD',
            type: 'TRANSFER',
            description: description || `External Transfer to ${toAccountNumber}`,
            status: 'COMPLETED',
            category: 'Transfer',
            merchant: toAccountNumber,
          },
        }),
      ]);
      transaction = tx;
    }

    res.status(201).json(transaction);
  } catch {
    res.status(500).json({ message: 'Transfer failed.' });
  }
};

export const getSpendingByCategory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
    const accountIds = accounts.map(a => a.id);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const spending = await prisma.transaction.groupBy({
      by: ['category'],
      where: {
        fromAccountId: { in: accountIds },
        type: 'DEBIT',
        status: 'COMPLETED',
        createdAt: { gte: startOfMonth },
        category: { not: null },
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    res.json(spending.map(s => ({ category: s.category, total: s._sum.amount || 0 })));
  } catch {
    res.status(500).json({ message: 'Failed to fetch spending data.' });
  }
};
