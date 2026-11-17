/** Consent Mode v2 constants, shared by the server layout and the client banner. */

export const CONSENT_STORAGE_KEY = 'shop:consent';
const STORAGE_KEY = CONSENT_STORAGE_KEY;

/**
 * Runs in <head> before any page script, so the consent default is the first dataLayer entry, ahead
 * of events pushed by components (Google requires the default before any tag or event). It also
 * re-applies a saved choice. Contains no user data; the strings are fixed.
 */
export const CONSENT_DEFAULT_SCRIPT = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});
try{var c=JSON.parse(localStorage.getItem('${STORAGE_KEY}'));if(c&&typeof c.analytics==='boolean'){var m=c.marketing?'granted':'denied';gtag('consent','update',{analytics_storage:c.analytics?'granted':'denied',ad_storage:m,ad_user_data:m,ad_personalization:m});}}catch(e){}`;
