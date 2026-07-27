import { Router } from 'express';
import { debugController } from '../controllers/debugController';

const router = Router();

router.get('/status/:code', debugController.returnStatus);

export default router;
