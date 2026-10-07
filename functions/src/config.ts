import { defineSecret, defineString } from 'firebase-functions/params';

export const HOST_EMAIL = defineString('HOST_EMAIL', {
  description: 'Google account email of the host. Only this account can use /admin.',
});
export const APP_URL = defineString('APP_URL', {
  description: 'Public URL of the site without trailing slash, e.g. https://my-project.web.app',
});
export const EMAIL_FROM = defineString('EMAIL_FROM', {
  description: 'Verified Resend sender, e.g. "Jane <meet@example.com>"',
});
export const GOOGLE_CLIENT_ID = defineString('GOOGLE_CLIENT_ID', {
  description: 'Google OAuth client ID (Web application)',
});

export const GOOGLE_CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');
export const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

export const appUrl = () => APP_URL.value().replace(/\/+$/, '');
