import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
}

/**
 * Signs a JWT token for a user
 * @param userId - The user's unique identifier
 * @returns JWT token string
 */
export const signToken = (userId: string): string => {
    return jwt.sign(
        { userId }, // Payload
        JWT_SECRET, // Secret key
        { expiresIn: JWT_EXPIRES_IN } // Options
    );
};

/**
 * Verifies and decodes a JWT token
 * @param token - JWT token string
 * @returns Decoded payload with userId
 * @throws Error if token is invalid or expired
 */
export const verifyToken = (token: string): { userId: string } => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
        return decoded;
    } catch (error) {
        throw new Error('Invalid or expired token');
    }
};