import type { NextFunction, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { HOST_EMAIL } from './config';
import { HttpError } from './errors';

/** Allows only the host's verified Google account (Firebase ID token in the Authorization header). */
export async function requireHost(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in required.');

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(token);
  } catch {
    throw new HttpError(401, 'Session expired. Sign in again.');
  }
  // Auth emulator accounts are not always marked verified.
  const verified = decoded.email_verified || process.env.FUNCTIONS_EMULATOR === 'true';
  const isHost = verified && decoded.email?.toLowerCase() === HOST_EMAIL.value().toLowerCase();
  if (!isHost) throw new HttpError(403, 'This account is not the owner of this calendar.');
  next();
}
