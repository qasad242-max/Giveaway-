import { Redis } from '@upstash/redis';

export const config = {
  runtime: 'edge',
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action'); // Check query param

  try {
    // ------------------------------------------------
    // ACTION 1: GET CURRENT EVENT ID (वेबसाइट पूछेगी अभी क्या चल रहा है?)
    // ------------------------------------------------
    if (req.method === 'GET' || action === 'get_event') {
      // Redis से पूछो कि Admin ने कौन सा इवेंट सेट किया है
      const activeEvent = await redis.get('config:active_event');
      return new Response(JSON.stringify({ 
        success: true, 
        eventId: activeEvent || 'DEFAULT_EVENT' 
      }), { status: 200 });
    }

    // ------------------------------------------------
    // ACTION 2: CLAIM COUPON (कूपन मांगना)
    // ------------------------------------------------
    if (req.method === 'POST') {
      const { userId, eventId } = await req.json();

      if (!userId || !eventId) {
        return new Response(JSON.stringify({ error: 'Missing Data' }), { status: 400 });
      }

      // Check if user already claimed THIS event
      const hasClaimed = await redis.get(`user:${eventId}:${userId}`);
      if (hasClaimed) {
        return new Response(JSON.stringify({ 
          success: true, 
          coupon: hasClaimed, 
          message: 'Already Claimed' 
        }), { status: 200 });
      }

      // Pick Random Coupon
      const coupon = await redis.spop(`coupons:${eventId}`);

      if (!coupon) {
        return new Response(JSON.stringify({ error: 'Sold Out' }), { status: 404 });
      }

      // Mark User as Claimed
      await redis.set(`user:${eventId}:${userId}`, coupon);

      return new Response(JSON.stringify({ success: true, coupon: coupon }), { status: 200 });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
}
