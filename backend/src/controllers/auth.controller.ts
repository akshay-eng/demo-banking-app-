import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { signToken } from '../utils/jwt';
import { v4 as uuidv4 } from 'uuid';

const generateAccountNumber = (): string => {
  return Array.from({ length: 4 }, () =>
    Math.floor(1000 + Math.random() * 9000)
  ).join(' ');
};

const generateCardNumber = (): string => {
  return `5412 ${Array.from({ length: 3 }, () =>
    Math.floor(1000 + Math.random() * 9000)
  ).join(' ')}`;
};

const generateCVV = (): string => String(Math.floor(100 + Math.random() * 900));

const getExpiryDate = (): string => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 4);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(-2)}`;
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ message: 'Email already registered.' });
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { id: uuidv4(), email, password: hashed, firstName, lastName, phone },
    });

    const checking = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        accountNumber: generateAccountNumber(),
        type: 'CHECKING',
        balance: 12450.75,
        currency: 'USD',
      },
    });

    const savings = await prisma.account.create({
      data: {
        id: uuidv4(),
        userId: user.id,
        accountNumber: generateAccountNumber(),
        type: 'SAVINGS',
        balance: 35200.00,
        currency: 'USD',
      },
    });

    await prisma.card.create({
      data: {
        id: uuidv4(),
        accountId: checking.id,
        cardNumber: generateCardNumber(),
        cardHolder: `${firstName.toUpperCase()} ${lastName.toUpperCase()}`,
        expiryDate: getExpiryDate(),
        cvv: generateCVV(),
        type: 'DEBIT',
        status: 'ACTIVE',
        limit: 5000,
      },
    });

    await prisma.card.create({
      data: {
        id: uuidv4(),
        accountId: savings.id,
        cardNumber: generateCardNumber(),
        cardHolder: `${firstName.toUpperCase()} ${lastName.toUpperCase()}`,
        expiryDate: getExpiryDate(),
        cvv: generateCVV(),
        type: 'CREDIT',
        status: 'ACTIVE',
        limit: 15000,
      },
    });

    const categories = ['Shopping', 'Food & Dining', 'Travel', 'Entertainment', 'Health', 'Utilities'];
    const merchants = ['Amazon', 'Whole Foods', 'Netflix', 'Uber', 'Starbucks', 'Apple Store', 'Shell', 'CVS Pharmacy', 'Delta Airlines', 'Hilton Hotels'];

    for (let i = 0; i < 20; i++) {
      const isDebit = Math.random() > 0.3;
      const amount = parseFloat((Math.random() * 500 + 10).toFixed(2));
      const daysAgo = Math.floor(Math.random() * 90);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);

      await prisma.transaction.create({
        data: {
          id: uuidv4(),
          fromAccountId: isDebit ? checking.id : null,
          toAccountId: isDebit ? null : checking.id,
          amount,
          currency: 'USD',
          type: isDebit ? 'DEBIT' : 'CREDIT',
          description: isDebit ? `Purchase at ${merchants[Math.floor(Math.random() * merchants.length)]}` : 'Direct Deposit',
          status: 'COMPLETED',
          category: categories[Math.floor(Math.random() * categories.length)],
          merchant: isDebit ? merchants[Math.floor(Math.random() * merchants.length)] : 'Employer Inc.',
          createdAt: date,
        },
      });
    }

    const token = signToken(user.id);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed.' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ message: 'Invalid email or password.' });
      return;
    }

    const token = signToken(user.id);
    res.json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed.' });
  }
};

export const getMe = async (req: Request & { userId?: string }, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ message: 'User not found.' });
      return;
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch user.' });
  }
};
