"""Rebuild authored media, EAN-13 labels and A6 print cards from products.json.
Run voices.ps1 first. Requires Pillow, reportlab, imageio-ffmpeg and pymupdf.
"""
import json, math, wave, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import imageio_ffmpeg
import pymupdf
ROOT=Path(__file__).resolve().parents[1]
products=json.loads((ROOT/'products.json').read_text())
assets=ROOT/'public/assets'; sources=ROOT/'asset-sources'; qa=ROOT/'qa-output'
for sub in ['products','media','barcodes','cards']:(assets/sub).mkdir(parents=True,exist_ok=True)
qa.mkdir(exist_ok=True)
FF=imageio_ffmpeg.get_ffmpeg_exe()
def ff(*args):subprocess.run([FF,'-y','-loglevel','error',*map(str,args)],check=True)
def wav(name,samples,rate=44100):
    with wave.open(str(assets/'media'/name),'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(rate);f.writeframes((np.clip(samples,-.8,.8)*32767).astype('<i2').tobytes())
for animal,source in [('cow','Beef_gemini.mp4'),('sheep','Lamb_gemini.mp4'),('pig','prototype/asset-sources/pig-original.webm')]:
    src=ROOT.parent/source
    ff('-ss',1,'-i',src,'-t',3,'-an','-vf','scale=960:-2','-c:v','libx264','-crf',23,'-pix_fmt','yuv420p','-movflags','+faststart',assets/'media'/f'{animal}.mp4')
    ff('-ss',1,'-i',src,'-t',2.8,'-vn','-ac',1,'-ar',44100,'-af','loudnorm=I=-21:TP=-4:LRA=6,afade=t=in:d=0.04,afade=t=out:st=2.55:d=0.25',assets/'media'/f'{animal}.wav')
# A stylised pig squeal layered with a real pig grunt: no claim of recorded distress.
ff('-i',sources/'pig-original.ogg','-ac',1,'-ar',44100,sources/'pig-grunt.wav')
with wave.open(str(sources/'pig-grunt.wav'),'rb') as f:grunt=np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768
rate=44100;t=np.arange(int(rate*2.7))/rate
freq=650+230*np.sin(t*2.1)+30*np.sin(t*2*np.pi*26)
phase=2*np.pi*np.cumsum(freq)/rate
envelope=np.minimum(t/.12,1)*np.minimum((2.7-t)/.25,1)*(0.7+0.3*np.sin(t*2*np.pi*4)**2)
squeal=.17*envelope*(np.sin(phase)+.3*np.sin(2*phase)+.12*np.sin(3*phase))
for offset in [0,.8,1.6]:
    start=int(offset*rate);end=min(start+len(grunt),len(squeal));squeal[start:end]+=.5*grunt[:end-start]
wav('pig.wav',squeal)
t=np.arange(int(rate*.12))/rate;wav('beep.wav',.16*np.sin(2*np.pi*1000*t)*np.minimum(t/.008,1)*np.minimum((.12-t)/.025,1))
# Cow character: pitch-shifted English voice with moo bookends and low cow layer.
ff('-i',sources/'thanks-voice.wav','-af','asetrate=22050*0.78,aresample=44100,atempo=1.18,lowpass=f=2600','-ac',1,sources/'thanks-low.wav')
def read_wav(p):
    with wave.open(str(p),'rb') as f:return np.frombuffer(f.readframes(f.getnframes()),dtype='<i2').astype(float)/32768
cow=read_wav(assets/'media/cow.wav');voice=read_wav(sources/'thanks-low.wav')
out=np.zeros(int(2.95*rate)); prefix=cow[:int(.5*rate)];out[:len(prefix)]+=.7*prefix
start=int(.48*rate);n=min(len(voice),int(1.85*rate));out[start:start+n]+=.85*voice[:n]
tail=cow[int(.6*rate):int(1.15*rate)];start=min(start+n,int(2.35*rate));n=min(len(tail),len(out)-start);out[start:start+n]+=.5*tail[:n]
wav('thanks.wav',out)
for n in ['welcome','unknown','membership','payment','complete']:
    ff('-i',sources/f'{n}.wav','-ac',1,'-ar',44100,'-af','loudnorm=I=-21:TP=-4:LRA=6',assets/'media'/f'{n}.wav')
L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
P=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']
def bits(code):
    assert len(code)==13 and (10-sum(int(x)*(1 if i%2==0 else 3) for i,x in enumerate(code[:12]))%10)%10==int(code[-1])
    return '101'+''.join((L if p=='L' else G)[int(d)] for p,d in zip(P[int(code[0])],code[1:7]))+'01010'+''.join(''.join('1' if x=='0' else '0' for x in L[int(d)]) for d in code[7:])+'101'
pdf=assets/'cards/product-cards.pdf';c=canvas.Canvas(str(pdf),pagesize=(105*mm,148*mm));c.setTitle('Field - seven A6 product cards')
for index,p in enumerate(products):
    code=p['barcode'];b=bits(code);bars=Image.new('RGB',(1200,360),'white');d=ImageDraw.Draw(bars)
    for i,x in enumerate(b):
        if x=='1':d.rectangle(((i+14)*9,10,(i+15)*9-1,300),fill='black')
    bars.save(assets/'barcodes'/f"{p['id']}.png")
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 123 35" width="70mm" height="20mm"><rect width="123" height="35" fill="white"/>'+''.join(f'<rect x="{i+14}" y="1" width="1" height="28"/>' for i,x in enumerate(b) if x=='1')+f'<text x="61.5" y="34" text-anchor="middle" font-family="monospace" font-size="4">{code}</text></svg>'
    (assets/'barcodes'/f"{p['id']}.svg").write_text(svg)
    c.setFillColorRGB(.97,.965,.95);c.rect(0,0,105*mm,148*mm,fill=1,stroke=0)
    c.setFillColorRGB(.71,.12,.17);c.setFont('Times-Bold',22);c.drawString(9*mm,136*mm,'field')
    c.setFillColorRGB(.4,.45,.37);c.setFont('Helvetica',6.5);c.drawRightString(96*mm,138*mm,f'PRODUCT {index+1:02d} / 07')
    c.drawImage(str(assets/'products'/f"{p['id']}.png"),18*mm,65*mm,width=69*mm,height=69*mm,mask='auto')
    c.setFillColorRGB(.14,.17,.14);c.setFont('Helvetica-Bold',16);c.drawString(9*mm,56*mm,p['name'])
    c.setFillColorRGB(.43,.47,.4);c.setFont('Helvetica',10);c.drawString(9*mm,49*mm,p['packSize'])
    c.setFillColorRGB(.71,.12,.17);c.setFont('Helvetica-Bold',24);c.drawString(9*mm,36*mm,f"${p['priceCents']/100:.2f}")
    c.setFont('Helvetica',7);c.drawRightString(96*mm,37*mm,'AUD / SIMULATED PRICE')
    c.setFillColorRGB(1,1,1);c.rect(9*mm,6*mm,87*mm,24*mm,fill=1,stroke=0)
    c.setFillColorRGB(0,0,0);module=70*mm/123;bx=17.5*mm
    for i,x in enumerate(b):
        if x=='1':c.rect(bx+(i+14)*module,12*mm,module,16*mm,fill=1,stroke=0)
    c.setFont('Courier',10);c.drawCentredString(52.5*mm,8*mm,code)
    c.setFillColorRGB(.46,.5,.43);c.setFont('Helvetica',5.8);c.drawCentredString(52.5*mm,2.6*mm,'UNIVERSITY PROTOTYPE / NOT A RETAIL PRODUCT')
    c.showPage()
c.save()
doc=pymupdf.open(pdf)
for i,p in enumerate(products):doc[i].get_pixmap(dpi=300).save(assets/'cards'/f"{p['id']}.png")
thumbs=Image.new('RGB',(840,600),'#dde0d5')
for i,page in enumerate(doc):
    pix=page.get_pixmap(dpi=45);im=Image.frombytes('RGB',(pix.width,pix.height),pix.samples);im.thumbnail((190,270));thumbs.paste(im,((i%4)*210+10,(i//4)*295+10))
thumbs.save(qa/'cards-contact.png')
print('Generated 7 EAN SVG/PNG, 7 card PNG, seven-page A6 PDF and fixed audio/video assets.')
