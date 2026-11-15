/**
 * Dress Return Check (scheduled job)
 *
 * Purpose: Remind the business owner, every working morning, about rented dresses that
 * were not returned on time.
 *
 * Operation: node-cron runs sendReturnReminders() (services/pushNotifications.js) at
 * 09:00 Israel time, Sunday to Friday. That function sends a web-push notification to every
 * subscribed device for each order whose rental dresses are still not marked as returned
 * two or more business days after the event. Does nothing when VAPID keys are not configured.
 */

import cron from 'node-cron';
import { sendReturnReminders } from './pushNotifications.js';

// Run every day at 09:00 AM (Israel Time)
// Schedule format: minute hour dayOfMonth month dayOfWeek
// 0 9 * * 0-5 means: 09:00, every day of the week from Sunday (0) to Friday (5)
export function startReturnCheckCron() {
  console.log('Initializing dress return check cron job (runs at 09:00, Sun-Fri)...');
  
  cron.schedule('0 9 * * 0-5', async () => {
    try {
      console.log(`[${new Date().toISOString()}] Cron trigger: Running return check...`);
      await sendReturnReminders();
    } catch (error) {
      console.error('Error running return check cron:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Jerusalem"
  });
}
