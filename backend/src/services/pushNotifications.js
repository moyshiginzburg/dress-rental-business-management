/**
 * Push Notifications Service (dress return reminders)
 *
 * Purpose: Tell the business owner, through web-push notifications on her phone / computer,
 * which customers have not returned rented dresses on time, with a one-tap WhatsApp reminder.
 *
 * Operation:
 *   - On import it makes sure the database has what this feature needs (order_items.returned,
 *     order_items.returned_at and the push_subscriptions table). New installs get them from
 *     db/schema.js; this covers existing databases, because the auto-update only restarts the
 *     backend and does not run migrations. Idempotent.
 *   - sendReturnReminders() (run daily by services/returnCheckCron.js) finds active orders whose
 *     event date has passed and whose rental dresses are not marked as returned. When at least
 *     2 business days (Sunday-Thursday) passed since the event, every subscribed device gets a
 *     notification with a "send WhatsApp" action (ready reminder text to the customer) and an
 *     "open order" action. Expired subscriptions (HTTP 404/410) are deleted.
 *   - Requires VAPID keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env); without them it is a no-op.
 */

import webpush from 'web-push';
import config, { businessConfig } from '../config/index.js';
import db, { all, run } from '../db/database.js';
import { createPushSubscriptionsTable } from '../db/schema.js';

// Schema needed by return tracking + push (skipped while the tables do not exist yet,
// i.e. before `npm run db:migrate` created a fresh database, which already includes them).
const orderItemColumns = new Set(db.pragma('table_info(order_items)').map((c) => c.name));
if (orderItemColumns.size > 0) {
  if (!orderItemColumns.has('returned')) db.exec('ALTER TABLE order_items ADD COLUMN returned INTEGER DEFAULT 0');
  if (!orderItemColumns.has('returned_at')) db.exec('ALTER TABLE order_items ADD COLUMN returned_at DATETIME');
  db.exec(createPushSubscriptionsTable);
}

function createWhatsAppLink(phone, message) {
  if (!phone) return '';
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('05')) {
    cleanPhone = '972' + cleanPhone.slice(1);
  }
  const url = `whatsapp://send?phone=${cleanPhone}`;
  if (message) {
    return `${url}&text=${encodeURIComponent(message)}`;
  }
  return url;
}

const pushConfigured = Boolean(config.push.publicKey && config.push.privateKey);

if (pushConfigured) {
  webpush.setVapidDetails(
    config.push.email,
    config.push.publicKey,
    config.push.privateKey
  );
} else {
  console.warn('Web Push VAPID keys are not configured. Push notifications are disabled.');
}

export async function sendPushNotification(subscription, payload) {
  try {
    const sub = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys_p256dh,
        auth: subscription.keys_auth
      }
    };
    await webpush.sendNotification(sub, JSON.stringify(payload));
    return true;
  } catch (error) {
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription has expired or is no longer valid
      console.log('Subscription expired/invalid, should be removed from DB:', subscription.id);
      // Let the caller handle DB removal if needed, or do it here.
    }
    console.error('Error sending push notification:', error);
    throw error;
  }
}

function calculateDateDiffs(eventDateStr, todayStr) {
  const eventDate = new Date(eventDateStr);
  const today = new Date(todayStr);
  
  // Set to midnight to avoid time issues
  eventDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  if (today <= eventDate) {
    return { actualDays: 0, businessDays: 0 };
  }

  const actualDays = Math.round((today - eventDate) / (1000 * 60 * 60 * 24));
  let businessDays = 0;

  const current = new Date(eventDate);
  current.setDate(current.getDate() + 1); // Start from day after event

  while (current <= today) {
    const day = current.getDay();
    if (day !== 5 && day !== 6) { // 5=Friday, 6=Saturday
      businessDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return { actualDays, businessDays };
}

export async function sendReturnReminders() {
  if (!pushConfigured) {
    console.warn('Skipping return reminders: VAPID keys not configured.');
    return;
  }

  console.log('Running return reminders check...');

  // Get current date in Israel timezone
  const nowInIsrael = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const todayStr = `${nowInIsrael.getFullYear()}-${String(nowInIsrael.getMonth() + 1).padStart(2, '0')}-${String(nowInIsrael.getDate()).padStart(2, '0')}`;

  // Find all active orders that have unreturned rental/sewing_for_rental items
  const unreturnedItemsSql = `
    SELECT 
      oi.order_id, 
      oi.dress_name,
      o.event_date,
      c.name as customer_name,
      COALESCE(c.receipt_name, c.name) as customer_display_name,
      c.phone as customer_phone
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN customers c ON o.customer_id = c.id
    WHERE o.status = 'active' 
      AND oi.item_type IN ('rental', 'sewing_for_rental')
      AND (oi.returned IS NULL OR oi.returned = 0)
      AND o.event_date IS NOT NULL
      AND o.event_date < ?
  `;

  const unreturnedItems = all(unreturnedItemsSql, [todayStr]);

  if (!unreturnedItems || unreturnedItems.length === 0) {
    console.log('No unreturned items to remind about.');
    return;
  }

  // Group by order
  const ordersMap = new Map();
  for (const item of unreturnedItems) {
    if (!ordersMap.has(item.order_id)) {
      ordersMap.set(item.order_id, {
        orderId: item.order_id,
        customerName: item.customer_name,
        customerDisplayName: item.customer_display_name,
        customerPhone: item.customer_phone,
        eventDate: item.event_date,
        itemsCount: 0
      });
    }
    ordersMap.get(item.order_id).itemsCount++;
  }

  // Send to every subscribed device of every user (usually just the business owner's devices)
  const subscriptions = all('SELECT * FROM push_subscriptions');
  if (!subscriptions || subscriptions.length === 0) {
    console.log('No push subscriptions found in DB.');
    return;
  }

  let sentCount = 0;

  for (const [orderId, orderData] of ordersMap.entries()) {
    const diffs = calculateDateDiffs(orderData.eventDate, todayStr);
    
    // Only remind if 2 or more business days have passed
    if (diffs.businessDays >= 2) {
      // Hebrew singular / plural agreement for the whole phrase (dress, rented, must)
      const dressText = orderData.itemsCount === 1
        ? 'השמלה שהושכרה לך צריכה'
        : 'השמלות שהושכרו לך צריכות';
      
      // The customer is greeted by her display name (never the app name, which may hold internal notes)
      const whatsappMessage = `שלום ${orderData.customerDisplayName} 👋\nזוהי הודעת תזכורת אוטומטית מ${businessConfig.name}:\n${dressText} לחזור אלינו בתוך יומיים ממועד האירוע, עברו ${diffs.actualDays} ימים מאז האירוע.\nמזכירה לך להחזיר עוד היום 🙏`;
      
      const whatsappUrl = createWhatsAppLink(orderData.customerPhone || '', whatsappMessage);
      
      const payload = {
        title: '⚠️ תזכורת החזרת שמלות',
        body: `${orderData.customerName} לא החזירה ${orderData.itemsCount === 1 ? 'שמלה אחת' : `${orderData.itemsCount} שמלות`} (עברו ${diffs.actualDays} ימים מהאירוע)`,
        data: {
          orderId: orderData.orderId,
          whatsappUrl: whatsappUrl,
          url: `/dashboard/orders?id=${orderData.orderId}`
        },
        actions: [
          { action: 'whatsapp', title: '📱 שלחי וואטסאפ' },
          { action: 'open', title: '📋 צפייה בהזמנה' }
        ]
      };

      for (const sub of subscriptions) {
        try {
          await sendPushNotification(sub, payload);
          sentCount++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Cleanup expired subscription
            run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
          }
        }
      }
    }
  }

  console.log(`Sent ${sentCount} push notification(s) for unreturned dresses.`);
}
