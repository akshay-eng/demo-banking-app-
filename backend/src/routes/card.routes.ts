import { Router } from 'express';
import { getCards, toggleCardStatus } from '../controllers/card.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', getCards);
router.patch('/:id/toggle', toggleCardStatus);

export default router;
