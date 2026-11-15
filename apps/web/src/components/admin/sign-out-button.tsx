'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { adminAuthClient } from '@/lib/auth-client';

export function AdminSignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      className="w-full"
      onClick={async () => {
        await adminAuthClient.signOut();
        router.replace('/admin/login');
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
