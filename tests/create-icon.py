from PIL import Image
from pathlib import Path
dest = Path(__file__).resolve().parents[1] / 'assets'
image = Image.open(dest / 'icon-generated.png').convert('RGBA')
image.resize((256,256), Image.Resampling.LANCZOS).save(dest / 'icon.png')
image.save(dest / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
