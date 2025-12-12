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
  const action = url.searchParams.get('action');

  // --- 🔥 HEADERS (Cache Problem Fix) ---
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  try {
    // ------------------------------------------------
    // ACTION 1: GET CURRENT EVENT ID
    // ------------------------------------------------
    if (req.method === 'GET' || action === 'get_event') {
      const activeEvent = await redis.get('config:active_event');
      return new Response(JSON.stringify({ 
        success: true, 
        eventId: activeEvent || 'DEFAULT_EVENT' 
      }), { status: 200, headers: headers });
    }

    // ------------------------------------------------
    // ACTION 2: CLAIM COUPON
    // ------------------------------------------------
    if (req.method === 'POST') {
      const { userId, eventId } = await req.json();

      if (!userId || !eventId) {
        return new Response(JSON.stringify({ error: 'Missing Data' }), { status: 400, headers: headers });
      }

      // 1. Check if user already claimed THIS event
      const hasClaimed = await redis.get(`user:${eventId}:${userId}`);
      if (hasClaimed) {
        return new Response(JSON.stringify({ 
          success: true, 
          coupon: hasClaimed, 
          message: 'Already Claimed' 
        }), { status: 200, headers: headers });
      }

      // 2. Pick Random Coupon (Remove from Active List)
      const coupon = await redis.spop(`coupons:${eventId}`);

      if (!coupon) {
        return new Response(JSON.stringify({ error: 'Sold Out' }), { status: 404, headers: headers });
      }

      // -----------------------------------------------------------
      // 👇👇👇 NEW LINE ADDED HERE (For Admin Panel List) 👇👇👇
      await redis.sadd(`claimed:${eventId}`, coupon);
      // -----------------------------------------------------------

      // 3. Mark User as Claimed
      await redis.set(`user:${eventId}:${userId}`, coupon);

      return new Response(JSON.stringify({ success: true, coupon: coupon }), { status: 200, headers: headers });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server Error' }), { status: 500, headers: headers });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: headers });
}
