import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // Handle Zod validation errors
    if (err instanceof ZodError) {
        res.status(400).json({
            error: {
                message: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: err.errors
            }
        });
        return;
    }

    // Handle custom AppError
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            error: {
                message: err.message,
                code: err.code
            }
        });
        return;
    }

    // Handle errors with statusCode property
    if (err.statusCode) {
        res.status(err.statusCode).json({
            error: {
                message: err.message || 'An error occurred',
                code: err.code || 'ERROR'
            }
        });
        return;
    }

    // Handle unknown errors (500)
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: {
            message: 'Internal server error',
            code: 'INTERNAL_ERROR'
        }
    });
};