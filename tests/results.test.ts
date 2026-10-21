import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTrial,command,approve,products} from '../core';
import {studyResults} from '../study-results';
const devices={checkout:true,scanner:true,ready:true};

test('trial download measures final Pay after back navigation and preserves purchase/deletion evidence',()=>{
    const t=createTrial('P01','A',false);const start=Date.parse('2026-10-21T00:00:00Z');
    const at=(second:number,action:()=>void)=>{const before=t.events.length;action();for(const e of t.events.slice(before))e.serverTimestamp=new Date(start+second*1000).toISOString();};
    const cmd=(type:string,extra={})=>{command(t,'checkout',{type,...extra},devices);};
    const scan=(id:string,scanId:string)=>{command(t,'scanner',{type:'scan',scanId,barcode:products.find(p=>p.id===id)!.barcode,inputMethod:'camera'},devices);};
    at(0,()=>cmd('start'));at(2,()=>scan('tofu','first'));at(3,()=>scan('tofu','second'));at(4,()=>scan('beef','beef'));
    at(5,()=>cmd('remove',{productId:'tofu'}));at(6,()=>cmd('pay'));at(7,()=>cmd('back'));at(10,()=>cmd('pay'));at(11,()=>cmd('membership'));at(12,()=>cmd('tap'));at(13,()=>approve(t));
    const r=studyResults(t);assert.equal(r.summary.shoppingSeconds,10);assert.equal(r.summary.totalCompletionSeconds,13);
    assert.equal(r.summary.totalCents,1500);assert.equal(r.summary.totalUnits,2);assert.equal(r.summary.veganUnits,1);assert.equal(r.summary.animalDerivedUnits,1);
    assert.equal(r.summary.deletedUnits,1);assert.equal(r.summary.addedUnits,3);assert.equal(r.summary.acceptedScans,3);assert.equal(r.summary.feedbackSeconds,0);
    assert.equal(r.purchases.find(p=>p.productId==='tofu')!.quantity,1);assert.equal(r.productActions.find(p=>p.productId==='tofu')!.deletedUnits,1);
    assert.equal(r.trial.condition,'A');assert.equal(r.trial.demo,false);assert.equal(r.events.length,t.events.length);
    assert.equal('code' in r.trial,false);assert.equal('seen' in r,false);assert.ok(r.events.every(e=>!('code' in e)&&!('token' in e)));
});
test('feedback waiting uses actual completion, skip and failure timestamps rather than clip length',()=>{
    const t=createTrial('P02','B',true),base=Date.parse('2026-10-21T00:00:00Z');
    const event=(eventType:string,second:number,extra={})=>({eventType,serverTimestamp:new Date(base+second*1000).toISOString(),...extra});
    t.receiptId='DEMO-RESULTS';t.cart={cola:1};t.cartOrder=['cola'];
    t.events=[event('trial_started',0),event('feedback_started',1,{feedbackId:'one',productId:'beef'}),event('feedback_completed',4.2,{feedbackId:'one'}),event('feedback_started',5,{feedbackId:'two',productId:'lamb'}),event('feedback_skipped',5.5,{feedbackId:'two'}),event('feedback_started',6,{feedbackId:'three',productId:'pork'}),event('feedback_failed',11,{feedbackId:'three'}),event('membership_prompt',12),event('payment_started',13),event('checkout_completed',14,{receiptId:t.receiptId})];
    const r=studyResults(t);assert.equal(r.summary.feedbackSeconds,8.7);assert.equal(r.summary.feedbackCompleted,1);assert.equal(r.summary.feedbackSkipped,1);assert.equal(r.summary.feedbackFailed,1);
    assert.equal(r.summary.otherUnits,1);assert.equal(r.summary.veganUnits,0);assert.equal(r.summary.shoppingSeconds,12);
});
test('missing timestamps remain null rather than fabricated zero-second timings',()=>{
    const r=studyResults(createTrial('LEGACY','A',true));assert.equal(r.summary.shoppingSeconds,null);assert.equal(r.summary.totalCompletionSeconds,null);assert.equal(r.summary.missingStart,true);assert.equal(r.summary.missingCompletion,true);
});
