import { Router } from 'express';
import { contactController } from '../controllers/contactController';

const router = Router();

router.get('/', contactController.getAll);
router.get('/stats', contactController.getStats);
router.get('/:id', contactController.getById);
router.post('/', contactController.create);
router.put('/:id', contactController.update);
router.delete('/:id', contactController.delete);

export default router;
