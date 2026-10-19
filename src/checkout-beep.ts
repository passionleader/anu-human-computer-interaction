/** Keep the short checkout tone on the already unlocked Web Audio output. */
export class CheckoutBeep {
    private buffer:AudioBuffer|null=null;
    constructor(private context:AudioContext){}
    async prepare(){
        this.buffer=null;
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),4000);
        try{
            const response=await fetch('/assets/media/beep.wav',{signal:controller.signal});
            if(!response.ok)throw Error('Checkout beep could not load');
            const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
            if(buffer.duration<0.03||!buffer.getChannelData(0).some(sample=>Math.abs(sample)>0.001))throw Error('Checkout beep is empty or silent');
            this.buffer=buffer;
        }finally{clearTimeout(timeout);}
    }
    async play(){
        if(!this.buffer)throw Error('Checkout beep is not prepared');
        if(this.context.state!=='running')await this.context.resume();
        if(this.context.state!=='running')throw Error('Checkout audio output is suspended');
        // A fresh source avoids HTMLMediaElement seeking/startup for a 120 ms clip.
        const source=this.context.createBufferSource(),gain=this.context.createGain();
        source.buffer=this.buffer;gain.gain.value=2;
        source.connect(gain);gain.connect(this.context.destination);
        source.onended=()=>{source.disconnect();gain.disconnect();};
        source.start(this.context.currentTime+0.01);
    }
}
