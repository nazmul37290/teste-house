import type { Metadata } from 'next';
import { apiServer } from '@/lib/api-server';
import type { SavedAddress } from '@/lib/order-types';
import { AddressesManager } from './addresses-manager';

export const metadata: Metadata = { title: 'My addresses', robots: { index: false } };

export default async function AddressesPage() {
  const addresses = await apiServer<SavedAddress[]>('/me/addresses');
  return <AddressesManager addresses={addresses} />;
}
