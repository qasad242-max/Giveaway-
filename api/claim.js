import { Redis } from '@upstash/redis';

// Server Side Logic - Secure & Fast
export const config = {
  runtime: 'edge', // Makes it ultra fast
};

// Keys Hardcoded here for your ease (Since you asked for direct upload)
// NOTE: Do not share this file publicly on GitHub if the repo is public.
const redis = new Redis({
  url: 'https://famous-mayfly-10264.upstash.io',
  token: 'ASgYAAIncDFlZmQzNGY3M2QyZGQ0ZGI2OTdjODkwMzM0ZjE2MTE2ZnAxMTAyNjQ',
});

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    const { eventId, userId } = await req.json();

    if (!eventId || !userId) {
      return new Response(JSON.stringify({ error: 'Missing Data' }), { status: 400 });
    }

    // 1. Check Duplicate User (Server Side)
    const hasClaimed = await redis.get(`user:${eventId}:${userId}`);
    if (hasClaimed) {
      return new Response(JSON.stringify({ 
        success: true, 
        coupon: hasClaimed, 
        message: 'Already Claimed' 
      }), { status: 200 });
    }

    // 2. Atomic Pop (SPOP) - Randomly pick & remove one coupon
    const coupon = await redis.spop(`coupons:${eventId}`);

    if (!coupon) {
      return new Response(JSON.stringify({ error: 'Sold Out' }), { status: 404 });
    }

    // 3. Mark User as Claimed
    await redis.set(`user:${eventId}:${userId}`, coupon);

    // 4. Return Coupon
    return new Response(JSON.stringify({ success: true, coupon: coupon }), { status: 200 });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 });
  }
}
