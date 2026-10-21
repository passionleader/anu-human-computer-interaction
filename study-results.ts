import {products,total,type Trial} from './core';

/** One completed trial only. No pairing capability, researcher token or other trials. */
export function studyResults(t:Trial){
    const all=t.events;
    const startIndex=all.findIndex(e=>e.eventType==='trial_started');
    const completionIndex=all.findIndex(e=>e.eventType==='checkout_completed'&&e.receiptId===t.receiptId);
    const task=startIndex>=0?all.slice(startIndex,completionIndex>=0?completionIndex+1:undefined):[];
    const start=task[0],completed=task.find(e=>e.eventType==='checkout_completed');
    const paymentIndex=task.findIndex(e=>e.eventType==='payment_started');
    const finalPay=task.slice(0,paymentIndex>=0?paymentIndex:undefined).filter(e=>e.eventType==='membership_prompt').at(-1);
    const seconds=(a:any,b:any)=>{
        const ms=Date.parse(b?.serverTimestamp)-Date.parse(a?.serverTimestamp);
        return Number.isFinite(ms)&&ms>=0?Math.round(ms)/1000:null;
    };
    const count=(name:string)=>task.filter(e=>e.eventType===name).length;
    const feedback=task.filter(e=>e.eventType==='feedback_started').map(e=>{
        const end=task.find(other=>other.feedbackId===e.feedbackId&&['feedback_completed','feedback_skipped','feedback_failed'].includes(other.eventType));
        return {productId:e.productId,feedbackId:e.feedbackId,status:end?.eventType.replace('feedback_','')||'unfinished',durationSeconds:seconds(e,end)};
    });
    const order=[...new Set([...(t.cartOrder||[]),...Object.keys(t.cart)])];
    const purchases=order.map(id=>products.find(p=>p.id===id)).filter(p=>p&&t.cart[p.id]>0).map(p=>({
        productId:p!.id,name:p!.name,packSize:p!.packSize,quantity:t.cart[p!.id],unitPriceCents:p!.priceCents,lineTotalCents:p!.priceCents*t.cart[p!.id],
        category:p!.isVegan?'vegan':p!.feedbackType==='animal'?'animal-derived':'unclassified',
    }));
    const productActions=products.filter(p=>task.some(e=>e.productId===p.id&&['item_added','item_removed'].includes(e.eventType))).map(p=>({
        productId:p.id,name:p.name,addedUnits:task.filter(e=>e.eventType==='item_added'&&e.productId===p.id).length,
        deletedUnits:task.filter(e=>e.eventType==='item_removed'&&e.productId===p.id).length,finalQuantity:t.cart[p.id]||0,
    }));
    return {
        schemaVersion:1,exportedAt:new Date().toISOString(),
        trial:{trialId:t.trialId,sessionId:t.sessionId,participantId:t.participantId,condition:t.condition,mode:t.condition==='A'?'normal':'vegan',demo:t.demo,receiptId:t.receiptId,created:t.created},
        summary:{
            shoppingSeconds:seconds(start,finalPay),totalCompletionSeconds:seconds(start,completed),
            feedbackSeconds:Math.round(feedback.reduce((sum,f)=>sum+(f.durationSeconds||0),0)*1000)/1000,
            totalCents:total(t),currency:'AUD',distinctProducts:purchases.length,totalUnits:purchases.reduce((sum,p)=>sum+p.quantity,0),
            veganUnits:purchases.filter(p=>p.category==='vegan').reduce((sum,p)=>sum+p.quantity,0),
            animalDerivedUnits:purchases.filter(p=>p.category==='animal-derived').reduce((sum,p)=>sum+p.quantity,0),
            otherUnits:purchases.filter(p=>p.category==='unclassified').reduce((sum,p)=>sum+p.quantity,0),
            addedUnits:count('item_added'),deletedUnits:count('item_removed'),cartResets:count('cart_cleared'),
            acceptedScans:count('scan_accepted'),rejectedScans:count('scan_rejected'),helpRequests:count('help_requested'),
            connectionLosses:count('connection_lost'),deviceErrors:count('device_error'),
            feedbackCompleted:count('feedback_completed'),feedbackSkipped:count('feedback_skipped'),feedbackFailed:count('feedback_failed'),
            missingStart:!start,missingCompletion:!completed,
        },
        purchases,productActions,feedback,
        definitions:{
            money:'All prices and totals are integer AUD cents; 500 means AUD 5.00.',
            shoppingSeconds:'Start shopping to final Pay before payment starts; includes shopping, scanning, revisions, feedback waits and errors. Not a measure of hesitation.',
            totalCompletionSeconds:'Start shopping to payment approval; includes membership and simulated payment processing. Excludes setup, Render wake-up and receipt-screen return delay.',
            feedbackSeconds:'Observed feedback start to completed/skipped/failed, not a fixed clip-count estimate.',
            deletedUnits:'Successful Delete/item_removed actions; cart resets are counted separately.',
            category:'Prototype catalogue grouping; unclassified Cola is not assumed to be vegan or animal-derived.',
        },
        events:all.map(e=>({...e})),
    };
}
