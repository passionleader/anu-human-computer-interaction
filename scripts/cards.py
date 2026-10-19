"""Rebuild printable cards and EAN labels without regenerating audio/video."""
import json
from pathlib import Path
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import pymupdf
ROOT=Path(__file__).resolve().parents[1]
products=json.loads((ROOT/"products.json").read_text())
assets=ROOT/"public/assets";qa=ROOT/"qa-output"
qa.mkdir(exist_ok=True)
L=['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
G=['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
P=['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']
def bits(code):
    assert len(code)==13 and (10-sum(int(x)*(1 if i%2==0 else 3) for i,x in enumerate(code[:12]))%10)%10==int(code[-1])
    return '101'+''.join((L if p=='L' else G)[int(d)] for p,d in zip(P[int(code[0])],code[1:7]))+'01010'+''.join(''.join('1' if x=='0' else '0' for x in L[int(d)]) for d in code[7:])+'101'
pdf=assets/'cards/product-cards.pdf';c=canvas.Canvas(str(pdf),pagesize=(105*mm,148*mm));c.setTitle(f'Field - {len(products)} A6 product cards')
for index,p in enumerate(products):
    code=p['barcode'];b=bits(code);bars=Image.new('RGB',(1200,360),'white');d=ImageDraw.Draw(bars)
    for i,x in enumerate(b):
        if x=='1':d.rectangle(((i+14)*9,10,(i+15)*9-1,300),fill='black')
    bars.save(assets/'barcodes'/f"{p['id']}.png")
    svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 123 35" width="70mm" height="20mm"><rect width="123" height="35" fill="white"/>'+''.join(f'<rect x="{i+14}" y="1" width="1" height="28"/>' for i,x in enumerate(b) if x=='1')+f'<text x="61.5" y="34" text-anchor="middle" font-family="monospace" font-size="4">{code}</text></svg>'
    (assets/'barcodes'/f"{p['id']}.svg").write_text(svg)
    c.setFillColorRGB(.97,.965,.95);c.rect(0,0,105*mm,148*mm,fill=1,stroke=0)
    c.setFillColorRGB(.71,.12,.17);c.setFont('Times-Bold',22);c.drawString(9*mm,136*mm,'field')
    c.setFillColorRGB(.4,.45,.37);c.setFont('Helvetica',6.5);c.drawRightString(96*mm,138*mm,f'PRODUCT {index+1:02d} / {len(products):02d}')
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
print(f'Generated {len(products)} EAN labels, card PNGs and A6 PDF pages.')
