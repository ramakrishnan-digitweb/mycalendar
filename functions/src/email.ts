import { DateTime } from 'luxon';
import { Resend } from 'resend';
import * as logger from 'firebase-functions/logger';
import { EMAIL_FROM, HOST_EMAIL, RESEND_API_KEY, appUrl } from './config';
import type { BookingDoc } from './db';
import { buildIcs } from './ics';

export type EmailKind = 'confirmed' | 'cancelled' | 'reminder';

interface Context {
  id: string;
  booking: BookingDoc;
  hostName: string;
  hostTimezone: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const when = (b: BookingDoc, zone: string) => {
  const start = DateTime.fromJSDate(b.startAt.toDate(), { zone });
  const end = DateTime.fromJSDate(b.endAt.toDate(), { zone });
  return `${start.toFormat('cccc, d LLLL yyyy')}, ${start.toFormat('h:mm a')} – ${end.toFormat('h:mm a')} (${zone})`;
};

export const manageUrl = (id: string, token: string) => `${appUrl()}/booking/${id}?token=${encodeURIComponent(token)}`;

function locationText(b: BookingDoc): string {
  if (b.location.type === 'google_meet') return b.meetLink ?? 'Google Meet (link in your calendar invite)';
  return b.location.value || '—';
}

function layout(title: string, rows: [string, string][], footer = ''): string {
  const body = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#111827">${v}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;padding:28px">
<h2 style="margin:0 0 16px;font-size:20px;color:#111827">${esc(title)}</h2>
<table style="border-collapse:collapse;font-size:14px">${body}</table>
${footer}
</div></body></html>`;
}

const button = (href: string, label: string) =>
  `<p style="margin-top:24px"><a href="${esc(href)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px">${esc(label)}</a></p>`;

const link = (href: string) => `<a href="${esc(href)}">${esc(href)}</a>`;

function locationHtml(b: BookingDoc) {
  const text = locationText(b);
  return /^https?:\/\//.test(text) ? link(text) : esc(text);
}

/** Sends the attendee + host emails for a booking event. Never throws — email failures are logged. */
export async function sendBookingEmails(kind: EmailKind, ctx: Context): Promise<void> {
  const { id, booking: b, hostName, hostTimezone } = ctx;
  const resend = new Resend(RESEND_API_KEY.value());
  const from = EMAIL_FROM.value();
  const manage = manageUrl(id, b.cancelToken);
  const ics = b.googleEventId
    ? undefined
    : [
        {
          filename: 'invite.ics',
          content: Buffer.from(
            buildIcs({
              uid: id,
              start: b.startAt.toDate(),
              end: b.endAt.toDate(),
              summary: `${b.eventTitle} with ${hostName}`,
              description: `Manage or cancel: ${manage}`,
              location: locationText(b),
              cancelled: kind === 'cancelled',
            }),
          ),
        },
      ];

  const attendeeRows: [string, string][] = [
    ['What', esc(b.eventTitle)],
    ['With', esc(hostName)],
    ['When', esc(when(b, b.timezone))],
    ['Where', locationHtml(b)],
  ];
  const hostRows: [string, string][] = [
    ['What', esc(b.eventTitle)],
    ['Guest', `${esc(b.name)} &lt;${esc(b.email)}&gt;`],
    ['When', esc(when(b, hostTimezone))],
    ['Where', locationHtml(b)],
    ...(b.notes ? ([['Notes', esc(b.notes).replace(/\n/g, '<br>')]] as [string, string][]) : []),
  ];

  const messages: Parameters<typeof resend.emails.send>[0][] = [];
  if (kind === 'confirmed') {
    messages.push(
      {
        from,
        to: b.email,
        replyTo: HOST_EMAIL.value(),
        subject: `Confirmed: ${b.eventTitle} with ${hostName}`,
        html: layout('Your meeting is booked', attendeeRows, button(manage, 'Cancel or view booking')),
        attachments: ics,
      },
      {
        from,
        to: HOST_EMAIL.value(),
        replyTo: b.email,
        subject: `New booking: ${b.eventTitle} with ${b.name}`,
        html: layout('New booking', hostRows, button(`${appUrl()}/admin`, 'Open dashboard')),
      },
    );
  } else if (kind === 'cancelled') {
    const reason = b.cancelReason ? ([['Reason', esc(b.cancelReason)]] as [string, string][]) : [];
    const by = b.cancelledBy === 'host' ? hostName : b.name;
    messages.push(
      {
        from,
        to: b.email,
        replyTo: HOST_EMAIL.value(),
        subject: `Cancelled: ${b.eventTitle} with ${hostName}`,
        html: layout(
          `Meeting cancelled by ${by}`,
          [...attendeeRows, ...reason],
          button(`${appUrl()}/${b.eventSlug}`, 'Book a new time'),
        ),
        attachments: ics,
      },
      {
        from,
        to: HOST_EMAIL.value(),
        subject: `Cancelled: ${b.eventTitle} with ${b.name}`,
        html: layout(`Booking cancelled by ${by}`, [...hostRows, ...reason]),
      },
    );
  } else {
    messages.push({
      from,
      to: b.email,
      replyTo: HOST_EMAIL.value(),
      subject: `Reminder: ${b.eventTitle} with ${hostName}`,
      html: layout('Upcoming meeting reminder', attendeeRows, button(manage, 'Cancel or view booking')),
    });
  }

  await Promise.all(
    messages.map(async (m) => {
      try {
        const { error } = await resend.emails.send(m);
        if (error) logger.error('Resend rejected email', { kind, to: m.to, error });
      } catch (err) {
        logger.error('Failed to send email', { kind, to: m.to, err });
      }
    }),
  );
}
