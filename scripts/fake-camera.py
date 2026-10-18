from pathlib import Path
from PIL import Image
import subprocess,imageio_ffmpeg
root=Path(__file__).resolve().parents[1];out=root/'qa-output'
frame=Image.new('RGB',(640,480),'white')
barcode=Image.open(root/'public/assets/barcodes/tofu.png').resize((580,174))
frame.paste(barcode,(30,153));frame.save(out/'camera-card.png')
# One barcode stays in view, leaves for 1.5s, then returns; 7s total.
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error','-loop','1','-i',str(out/'camera-card.png'),'-vf',"drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='between(t,3,4.5)',fps=15,format=yuv420p",'-t','7','-f','yuv4mpegpipe',str(out/'camera.y4m')],check=True)
