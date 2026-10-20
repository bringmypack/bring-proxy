// Test-only domain prototype. No HTTP routes, persistence, live payments or transfers.
// Construct the real Stripe SDK client in a future server adapter; never accept a client from HTTP.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
const verifiedEvents = new WeakSet();
const fail = code => { throw Error(code); };
const hash = (o, token) => createHash('sha256').update(o.id+'|'+o.recipient_id+'|'+token).digest('hex');
export function createTestOrder(c) {
  if (!c || !/^[A-Za-z0-9_-]{8,100}$/.test(c.id || '') ||
      !c.recipient_id || !c.traveller_id || c.recipient_id === c.traveller_id ||
      !Number.isSafeInteger(c.amount) || c.amount < 50 ||
      !Number.isSafeInteger(c.fee) || c.fee < 0 || c.fee >= c.amount ||
      c.currency !== 'eur' || c.terms_accepted !== true) fail('INVALID_AGREEMENT');
  return {id:c.id,recipient_id:c.recipient_id,traveller_id:c.traveller_id,
    amount:c.amount,fee:c.fee,currency:c.currency,livemode:false,
    state:'awaiting_payment',dispute:false,checkout_id:null,payment_intent:null,
    proof:null,events:[]};
}
export function checkoutRequest(o, returnUrls) {
  if (o.livemode !== false || o.state !== 'awaiting_payment') fail('TEST_ONLY');
  for (const key of ['success_url','cancel_url']) {
    if (!/^https:\/\//.test(returnUrls?.[key] || '')) fail('INVALID_RETURN_URL');
  }
  return {mode:'payment',locale:'fr',client_reference_id:o.id,
    integration_identifier:'bringmypack_test_pqmrnxaz',metadata:{order_id:o.id,purpose:'integration_test'},
    line_items:[{quantity:1,price_data:{currency:o.currency,unit_amount:o.amount,
      product_data:{name:'BringMyPack — TEST technique, aucun transport réel'}}}],
    payment_intent_data:{transfer_group:o.id,metadata:{order_id:o.id}},
    success_url:returnUrls.success_url,cancel_url:returnUrls.cancel_url};
}
export function bindCheckout(o, session) {
  if (session.livemode !== false || session.mode !== 'payment' ||
      session.client_reference_id !== o.id || session.metadata?.order_id !== o.id ||
      session.amount_total !== o.amount || session.currency !== o.currency ||
      !/^cs_test_/.test(session.id || '') ||
      (o.checkout_id && o.checkout_id !== session.id)) fail('CHECKOUT_MISMATCH');
  return {...o,checkout_id:session.id};
}
export function verifyTestWebhook(stripeClient, rawBody, signature, signingSecret) {
  // Real adapter MUST use the Stripe SDK on the raw request body, before JSON parsing.
  if (!signature || !signingSecret) fail('WEBHOOK_SIGNATURE_REQUIRED');
  const event = stripeClient.webhooks.constructEvent(rawBody,signature,signingSecret);
  if (!event || event.livemode !== false || !/^evt_/.test(event.id || '')) fail('TEST_ONLY');
  verifiedEvents.add(event);
  return event;
}
export function applyPaymentEvent(o, event) {
  if (!verifiedEvents.has(event) || o.livemode !== false) fail('UNVERIFIED_WEBHOOK');
  if (o.events.includes(event.id)) return o;
  if (!['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type))
    fail('UNSUPPORTED_EVENT');
  const s=event.data.object;
  bindCheckout(o,s);
  if (!o.checkout_id || o.checkout_id !== s.id) fail('CHECKOUT_MISMATCH');
  if (s.payment_status !== 'paid') return {...o,events:[...o.events,event.id]};
  if (!/^pi_/.test(s.payment_intent || '')) fail('PAYMENT_INTENT_REQUIRED');
  if (['refunded','refund_review','released'].includes(o.state)) fail('TERMINAL_ORDER');
  return {...o,payment_intent:s.payment_intent,
    state:o.dispute?'disputed':o.state==='delivery_confirmed'?'delivery_confirmed':'paid_awaiting_delivery',events:[...o.events,event.id]};
}
export function issueDeliveryProof(o, expiresAt, now=Date.now()) {
  if (o.state !== 'paid_awaiting_delivery' || o.dispute ||
      !Number.isFinite(expiresAt) || expiresAt <= now) fail('PROOF_NOT_ALLOWED');
  const token=randomBytes(32).toString('hex');
  return {token,order:{...o,proof:{digest:hash(o,token),expires_at:expiresAt,used:false}}};
}
export function confirmDelivery(o, authenticatedActorId, token, now=Date.now()) {
  // Actor comes from verified server authentication, never a user-supplied JSON actor field.
  if (o.state !== 'paid_awaiting_delivery' || o.dispute ||
      authenticatedActorId !== o.recipient_id || !o.proof || o.proof.used ||
      o.proof.expires_at <= now || !/^[a-f0-9]{64}$/.test(token || '')) fail('INVALID_DELIVERY_PROOF');
  const actual=Buffer.from(hash(o,token),'hex'), expected=Buffer.from(o.proof.digest,'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) fail('INVALID_DELIVERY_PROOF');
  return {...o,state:'delivery_confirmed',proof:{...o.proof,used:true},delivered_at:now};
}
export function blockOrder(o, reason) {
  if (!['dispute','refund_requested','refund_confirmed'].includes(reason)) fail('INVALID_BLOCK');
  return {...o,dispute:true,state:reason==='refund_confirmed'?'refunded':reason==='dispute'?'disputed':'refund_review'};
}
export function testTransferRequest(o, recipientAccount) {
  if (o.livemode !== false || recipientAccount?.livemode !== false) fail('TEST_ONLY');
  if (o.state !== 'delivery_confirmed' || o.dispute || !o.proof?.used ||
      !o.payment_intent || recipientAccount.owner_id !== o.traveller_id ||
      recipientAccount.transfers_active !== true || !/^acct_/.test(recipientAccount.id || ''))
    fail('TRANSFER_BLOCKED');
  // This only describes a request. No transfer is made by this prototype.
  return {parameters:{amount:o.amount-o.fee,currency:o.currency,
    destination:recipientAccount.id,transfer_group:o.id,metadata:{order_id:o.id}},
    options:{idempotencyKey:'bmp_release_'+o.id},payment_intent_to_recheck:o.payment_intent};
}
export function markTestTransferRecorded(o, transfer, recipientAccount) {
  const expected = testTransferRequest(o, recipientAccount);
  if (o.state !== 'delivery_confirmed' || o.dispute || transfer.livemode !== false ||
      transfer.metadata?.order_id !== o.id || transfer.transfer_group !== o.id ||
      transfer.amount !== o.amount-o.fee || transfer.currency !== o.currency ||
      transfer.destination !== expected.parameters.destination ||
      !/^tr_/.test(transfer.id || '')) fail('TRANSFER_MISMATCH');
  return {...o,state:'released',transfer_id:transfer.id};
}
