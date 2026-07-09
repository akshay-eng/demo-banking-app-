import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

export const getCards = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
    const accountIds = accounts.map(a => a.id);

    const cards = await prisma.card.findMany({
      where: { accountId: { in: accountIds } },
      include: { account: { select: { type: true, balance: true, currency: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(cards);
  } catch {
    res.status(500).json({ message: 'Failed to fetch cards.' });
  }
};

export const toggleCardStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const accounts = await prisma.account.findMany({ where: { userId: req.userId }, select: { id: true } });
    const accountIds = accounts.map(a => a.id);

    const card = await prisma.card.findFirst({ where: { id: req.params.id, accountId: { in: accountIds } } });
    if (!card) {
      res.status(404).json({ message: 'Card not found.' });
      return;
    }

    const updated = await prisma.card.update({
      where: { id: card.id },
      data: { status: card.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE' },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ message: 'Failed to update card status.' });
  }
};
