import { Router } from 'express';
import { getTransactions, createTransfer, getSpendingByCategory } from '../controllers/transaction.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', getTransactions);
router.get('/spending', getSpendingByCategory);
router.post('/transfer', createTransfer);

export default router;
