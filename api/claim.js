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

  // --- 🔥 HEADERS (Anti-Cache) ---
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };

  try {
    // ------------------------------------------------
    // ACTION 1: GET EVENT ID
    // ------------------------------------------------
    if (req.method === 'GET' || action === 'get_event') {
      const activeEvent = await redis.get('config:active_event');
      return new Response(JSON.stringify({ 
        success: true, 
        eventId: activeEvent || 'DEFAULT_EVENT' 
      }), { status: 200, headers: headers });
    }

    // ------------------------------------------------
    // ACTION 2: CLAIM COUPON (WITH IP CHECK)
    // ------------------------------------------------
    if (req.method === 'POST') {
      const { userId, eventId } = await req.json();

      if (!userId || !eventId) {
        return new Response(JSON.stringify({ error: 'Missing Data' }), { status: 400, headers: headers });
      }

      // 🔥 STEP 1: GET USER IP ADDRESS
      // Vercel Edge functions me IP 'x-forwarded-for' header me hoti hai
      const ipRaw = req.headers.get('x-forwarded-for') || 'unknown';
      const userIp = ipRaw.split(',')[0].trim(); // Agar multiple IP ho to pehli wali lenge

      // 🔥 STEP 2: CHECK IF IP ALREADY CLAIMED
      const ipKey = `ip:${eventId}:${userIp}`;
      const isIpBlocked = await redis.get(ipKey);

      if (isIpBlocked) {
        return new Response(JSON.stringify({ 
          success: true, 
          coupon: isIpBlocked, // Unhe wahi purana coupon dikha do
          message: 'Already Claimed (IP Limit)' 
        }), { status: 200, headers: headers });
      }

      // 🔥 STEP 3: CHECK IF USER ID ALREADY CLAIMED
      const userKey = `user:${eventId}:${userId}`;
      const hasClaimed = await redis.get(userKey);

      if (hasClaimed) {
        return new Response(JSON.stringify({ 
          success: true, 
          coupon: hasClaimed, 
          message: 'Already Claimed' 
        }), { status: 200, headers: headers });
      }

      // 🔥 STEP 4: PICK RANDOM COUPON
      const coupon = await redis.spop(`coupons:${eventId}`);

      if (!coupon) {
        return new Response(JSON.stringify({ error: 'Sold Out' }), { status: 404, headers: headers });
      }

      // 🔥 STEP 5: SAVE EVERYTHING (User + IP + Claim List)
      
      // A. User Lock
      await redis.set(userKey, coupon);
      
      // B. IP Lock (Ye naya hai)
      await redis.set(ipKey, coupon);
      
      // C. Admin Panel List
      await redis.sadd(`claimed:${eventId}`, coupon);

      return new Response(JSON.stringify({ success: true, coupon: coupon }), { status: 200, headers: headers });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server Error: ' + error.message }), { status: 500, headers: headers });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: headers });
}
