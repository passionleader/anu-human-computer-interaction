"""Update female guidance and user-supplied lamb/pork video; leave cow/audio feedback intact.

Run voices.ps1 first. Requires imageio-ffmpeg (PYTHONPATH=.python-deps locally).
"""
from pathlib import Path
import subprocess
import imageio_ffmpeg

root = Path(__file__).resolve().parents[1]
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()

def ff(*args):
    subprocess.run([ffmpeg, '-y', '-loglevel', 'error', *map(str, args)], check=True)

for name in ['welcome', 'unknown', 'membership', 'payment', 'complete']:
    ff('-i', root/'asset-sources'/f'{name}.wav', '-ac', 1, '-ar', 44100,
       '-af', 'loudnorm=I=-21:TP=-4:LRA=6', root/'public/assets/media'/f'{name}.wav')

for animal, source in [('sheep', 'lamb_gemini.mp4'), ('pig', 'pork_gemini.mp4')]:
    ff('-ss', 1, '-i', root.parent/source, '-t', 3, '-an',
       '-vf', 'scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,setsar=1',
       '-r', 30, '-c:v', 'libx264', '-crf', 23, '-pix_fmt', 'yuv420p',
       '-movflags', '+faststart', root/'public/assets/media'/f'{animal}.mp4')
