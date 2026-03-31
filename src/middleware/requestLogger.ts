import { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        const { method, originalUrl } = req;
        const { statusCode } = res;

        console.log(`${method} ${originalUrl} ${statusCode} ${duration}ms`);
    });

    next();
};