import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'demo-secret-key';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const signToken = (userId: string): string => {
  return jwt.sign({ userId }, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
};

export const verifyToken = (token: string): { userId: string } => {
  return jwt.verify(token, SECRET) as { userId: string };
};
