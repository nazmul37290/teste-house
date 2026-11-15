import { Alert } from '@/components/ui';

export function NoAccess() {
  return (
    <Alert tone="warning">
      You do not have permission to open this page. Ask a Super Admin if you need it.
    </Alert>
  );
}
