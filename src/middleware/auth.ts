import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt';

/**
 * Authentication middleware
 * Verifies JWT token from Authorization header and attaches userId to request
 */
export const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                error: {
                    message: 'No token provided',
                    code: 'NO_TOKEN'
                }
            });
            return;
        }

        // Remove 'Bearer ' prefix to get the token
        const token = authHeader.substring(7);

        // Verify token and extract userId
        const { userId } = verifyToken(token);

        // Attach userId to request object for use in route handlers
        req.userId = userId;

        // Proceed to next middleware/route handler
        next();
    } catch (error) {
        res.status(401).json({
            error: {
                message: 'Invalid or expired token',
                code: 'INVALID_TOKEN'
            }
        });
    }
};