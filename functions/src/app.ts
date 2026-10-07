import express, { type NextFunction, type Request, type Response } from 'express';
import * as logger from 'firebase-functions/logger';
import { appUrl } from './config';
import { HttpError } from './errors';
import { completeGoogleAuth } from './google';
import { adminRouter } from './routes/admin';
import { publicRouter } from './routes/public';

export const app = express();
app.disable('x-powered-by');
// Firebase already parses JSON bodies in production; this covers other runtimes.
app.use(express.json({ limit: '100kb' }));

const api = express.Router();
api.use('/public', publicRouter);
api.use('/admin', adminRouter);

// OAuth redirect target registered in Google Cloud Console: <APP_URL>/api/google/callback
api.get('/google/callback', async (req, res) => {
  const back = (q: string) => res.redirect(`${appUrl()}/admin/settings?${q}`);
  const { code, state, error } = req.query;
  if (typeof error === 'string') return back(`google=error&message=${encodeURIComponent(error)}`);
  if (typeof code !== 'string' || typeof state !== 'string') return back('google=error&message=missing_code');
  try {
    await completeGoogleAuth(code, state);
    back('google=connected');
  } catch (err) {
    logger.error('Google OAuth callback failed', err);
    const message = err instanceof HttpError ? err.message : 'Could not connect Google Calendar.';
    back(`google=error&message=${encodeURIComponent(message)}`);
  }
});

app.use('/api', api);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  logger.error('Unhandled API error', err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
