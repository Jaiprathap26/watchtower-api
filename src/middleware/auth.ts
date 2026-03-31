import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';
import { AppError } from '../lib/errors';

export const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new AppError('No token provided', 401, 'NO_TOKEN');
        }

        const token = authHeader.substring(7);
        const { userId } = verifyToken(token);
        req.userId = userId;

        next();
    } catch (error) {
        if (error instanceof AppError) {
            next(error);
        } else {
            next(new AppError('Invalid or expired token', 401, 'INVALID_TOKEN'));
        }
    }
};