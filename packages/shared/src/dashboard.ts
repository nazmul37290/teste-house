import { z } from 'zod';

// Dashboard --------------------------------------------------------------------------------------

export const DASHBOARD_PERIODS = [7, 30, 90] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/** GET /admin/dashboard?days= (reports.view). */
export const dashboardQuerySchema = z.strictObject({
  days: z.coerce
    .number()
    .int()
    .refine((d): d is DashboardPeriod => (DASHBOARD_PERIODS as readonly number[]).includes(d), {
      message: 'Use 7, 30 or 90',
    })
    .default(30),
});
