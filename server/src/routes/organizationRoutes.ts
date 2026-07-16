import { Router } from 'express';
import { organizationController } from '../controllers/organizationController';

const router = Router();

router.get('/', organizationController.getAll);
router.get('/stats', organizationController.getStats);
router.get('/:id', organizationController.getById);
router.post('/', organizationController.create);
router.put('/:id', organizationController.update);
router.delete('/:id', organizationController.delete);

export default router;
