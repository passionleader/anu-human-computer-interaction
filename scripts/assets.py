"""Rebuild authored media, EAN-13 labels and A6 print cards from products.json.
Run voices.ps1 first. Requires Pillow, reportlab, imageio-ffmpeg and pymupdf.
"""
import json, math, wave, subprocess, sys
from pathlib import Path
import numpy as np
import imageio_ffmpeg
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
for animal,source in [('cow','Beef_gemini.mp4'),('sheep','lamb_gemini.mp4'),('pig','pork_gemini.mp4')]:
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
import runpy
runpy.run_path(str(ROOT/'scripts/cards.py'),run_name='__main__')
