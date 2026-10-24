import { randomBytes } from 'node:crypto';
import { switchReviewHtml } from '@/lib/switch-review-page';
export const dynamic='force-dynamic';
export async function GET(){
 const nonce=randomBytes(24).toString('base64');
 return new Response(switchReviewHtml(nonce),{headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store, max-age=0',
  'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','X-Frame-Options':'DENY',
  'X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
 }});
}
