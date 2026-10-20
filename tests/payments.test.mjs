import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../lib/payments-prototype.js';
const make=()=>p.createTestOrder({id:'test_order_20261020',recipient_id:'recipient_1',traveller_id:'traveller_1',amount:1000,fee:100,currency:'eur',terms_accepted:true});
const session={id:'cs_test_fixture',livemode:false,mode:'payment',client_reference_id:'test_order_20261020',metadata:{order_id:'test_order_20261020'},amount_total:1000,currency:'eur',payment_status:'paid',payment_intent:'pi_fixture'};
const account={id:'acct_fixture',livemode:false,owner_id:'traveller_1',transfers_active:true};
function paid() {
 const order=p.bindCheckout(make(),session);
 const event=p.verifyTestWebhook({webhooks:{constructEvent(){return {id:'evt_fixture',livemode:false,type:'checkout.session.completed',data:{object:session}}}}},Buffer.from('test'),'sig','secret');
 return {order:p.applyPaymentEvent(order,event),event};
}
test('Checkout never transfers automatically or sets an invented processing fee',()=>{
 const req=p.checkoutRequest(make(),{success_url:'https://example.com/success',cancel_url:'https://example.com/cancel'});
 assert.equal(req.payment_intent_data.transfer_data,undefined);
 assert.equal(req.payment_intent_data.application_fee_amount,undefined);
 assert.equal(req.payment_method_types,undefined);
 assert.equal(req.line_items[0].price_data.unit_amount,1000);
});
test('Unverified event and live-mode objects are refused',()=>{
 assert.throws(()=>p.applyPaymentEvent(make(),{}),/UNVERIFIED_WEBHOOK/);
 assert.throws(()=>p.bindCheckout(make(),{...session,livemode:true}),/CHECKOUT_MISMATCH/);
 assert.throws(()=>p.verifyTestWebhook({webhooks:{constructEvent(){throw Error('bad signature')}}},'','s','key'),/bad signature/);
});
test('Changed amount or checkout cannot mark payment as paid',()=>{
 assert.throws(()=>p.bindCheckout(make(),{...session,amount_total:1}),/CHECKOUT_MISMATCH/);
 const order=p.bindCheckout(make(),session);
 assert.throws(()=>p.bindCheckout(order,{...session,id:'cs_test_other'}),/CHECKOUT_MISMATCH/);
});
test('Webhook retry is idempotent and payment alone cannot release funds',()=>{
 const {order,event}=paid(); assert.equal(p.applyPaymentEvent(order,event),order);
 assert.throws(()=>p.testTransferRequest(order,account),/TRANSFER_BLOCKED/);
});
test('Only recipient proof, once and before expiry, confirms delivery',()=>{
 const {token,order}=p.issueDeliveryProof(paid().order,2000,1000);
 assert.throws(()=>p.confirmDelivery(order,'traveller_1',token,1500),/INVALID_DELIVERY_PROOF/);
 assert.throws(()=>p.confirmDelivery(order,'recipient_1','a'.repeat(64),1500),/INVALID_DELIVERY_PROOF/);
 assert.throws(()=>p.confirmDelivery(order,'recipient_1',token,2000),/INVALID_DELIVERY_PROOF/);
 const delivered=p.confirmDelivery(order,'recipient_1',token,1500);
 assert.throws(()=>p.confirmDelivery(delivered,'recipient_1',token,1600),/INVALID_DELIVERY_PROOF/);
 const request=p.testTransferRequest(delivered,account);
 assert.equal(request.parameters.amount,900);
 assert.equal(request.options.idempotencyKey,'bmp_release_test_order_20261020');
});
test('Dispute and refunds block release even after delivery',()=>{
 const {token,order}=p.issueDeliveryProof(paid().order,2000,1000);
 const delivered=p.confirmDelivery(order,'recipient_1',token,1500);
 for(const reason of ['dispute','refund_requested','refund_confirmed'])
   assert.throws(()=>p.testTransferRequest(p.blockOrder(delivered,reason),account),/TRANSFER_BLOCKED/);
 assert.throws(()=>p.testTransferRequest(delivered,{...account,owner_id:'someone_else'}),/TRANSFER_BLOCKED/);
 assert.throws(()=>p.testTransferRequest(delivered,{...account,livemode:true}),/TEST_ONLY/);
});
test('Transfer receipt is checked and a released order cannot release again',()=>{
 const {token,order}=p.issueDeliveryProof(paid().order,2000,1000);
 const delivered=p.confirmDelivery(order,'recipient_1',token,1500);
 const receipt={id:'tr_fixture',livemode:false,metadata:{order_id:delivered.id},transfer_group:delivered.id,amount:900,currency:'eur',destination:account.id};
 assert.throws(()=>p.markTestTransferRecorded(delivered,{...receipt,amount:1},account),/TRANSFER_MISMATCH/);
 const released=p.markTestTransferRecorded(delivered,receipt,account);
 assert.throws(()=>p.testTransferRequest(released,account),/TRANSFER_BLOCKED/);
});

test('Late distinct payment webhook preserves an already confirmed delivery',()=>{
 const initial=paid(); const {token,order}=p.issueDeliveryProof(initial.order,2000,1000);
 const delivered=p.confirmDelivery(order,'recipient_1',token,1500);
 const late=p.verifyTestWebhook({webhooks:{constructEvent(){return {...initial.event,id:'evt_late'};}}},'raw','sig','secret');
 assert.equal(p.applyPaymentEvent(delivered,late).state,'delivery_confirmed');
});
