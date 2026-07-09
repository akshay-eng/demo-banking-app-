import { Router } from 'express';
import { getAccounts, getAccountById, getSummary } from '../controllers/account.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', getAccounts);
router.get('/summary', getSummary);
router.get('/:id', getAccountById);

export default router;
