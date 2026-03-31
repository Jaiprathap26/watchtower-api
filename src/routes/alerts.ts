import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { AppError } from '../lib/errors';

const router = Router();

// GET /api/alerts - Get all alerts for current user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ alerts });
  } catch (error) {
    console.error('Get alerts error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

// POST /api/alerts - Create new alert
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, value } = req.body;

    if (!type || !value) {
      throw new AppError('Type and value are required', 400, 'MISSING_FIELDS');
    }

    if (type !== 'email') {
      throw new AppError('Only email alerts are supported', 400, 'INVALID_TYPE');
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new AppError('Invalid email address', 400, 'INVALID_EMAIL');
    }

    // Check if alert already exists
    const existing = await prisma.alert.findFirst({
      where: {
        userId: req.userId,
        type: type,
        value: value
      }
    });

    if (existing) {
      throw new AppError('Alert already exists', 409, 'ALERT_EXISTS');
    }

    const alert = await prisma.alert.create({
      data: {
        userId: req.userId!,
        type: type,
        value: value
      }
    });

    res.status(201).json(alert);
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
      return;
    }

    console.error('Create alert error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

// DELETE /api/alerts/:id - Delete alert
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const alert = await prisma.alert.findUnique({
      where: { id }
    });

    if (!alert) {
      throw new AppError('Alert not found', 404, 'ALERT_NOT_FOUND');
    }

    if (alert.userId !== req.userId) {
      throw new AppError('Unauthorized', 403, 'UNAUTHORIZED');
    }

    await prisma.alert.delete({
      where: { id }
    });

    res.status(200).json({ message: 'Alert deleted successfully' });
  } catch (error: any) {
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: {
          message: error.message,
          code: error.code
        }
      });
      return;
    }

    console.error('Delete alert error:', error);
    res.status(500).json({
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  }
});

export default router;