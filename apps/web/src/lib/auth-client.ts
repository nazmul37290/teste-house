import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// docs/auth.md section 8. Both talk to the web origin; the rewrite forwards to the API.
export const customerAuthClient = createAuthClient({ basePath: '/api/v1/auth' });

export const adminAuthClient = createAuthClient({
  basePath: '/api/v1/admin/auth',
  // On a 2FA account, sign-in answers twoFactorRedirect; the login page then asks for the code.
  plugins: [twoFactorClient()],
});
