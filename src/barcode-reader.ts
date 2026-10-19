import {BrowserMultiFormatReader} from '@zxing/browser';
import {BarcodeFormat, DecodeHintType} from '@zxing/library';

/** Search beyond the centre rows; explicitly rotate non-square camera frames. */
export class EANCameraReader extends BrowserMultiFormatReader {
    private rotated:HTMLCanvasElement|null=null;
    constructor(){
        super(new Map<DecodeHintType,any>([
            [DecodeHintType.POSSIBLE_FORMATS,[BarcodeFormat.EAN_13]],
            [DecodeHintType.TRY_HARDER,true],
        ]),{delayBetweenScanAttempts:160,delayBetweenScanSuccess:140});
    }
    override decodeFromCanvas(canvas:HTMLCanvasElement){
        try{return super.decodeFromCanvas(canvas);}
        catch(original){
            // ZXing's canvas luminance rotation retains the original dimensions.
            // Rotate the canvas itself so portrait/landscape dimensions agree.
            const rotated=this.rotated??=document.createElement('canvas');
            rotated.width=canvas.height;rotated.height=canvas.width;
            const context=rotated.getContext('2d',{willReadFrequently:true});
            if(!context)throw original;
            context.translate(rotated.width/2,rotated.height/2);
            context.rotate(Math.PI/2);
            context.drawImage(canvas,-canvas.width/2,-canvas.height/2);
            return super.decodeFromCanvas(rotated);
        }
    }
}
