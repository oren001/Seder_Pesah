import pypdf
import json

pdf_path = r'C:\Users\oren weiss\Downloads\ukEv13158223.pdf'

reader = pypdf.PdfReader(pdf_path)
full_text = ""
for page in reader.pages:
    full_text += page.extract_text() + "\n"

with open('haggadah_full_raw.txt', 'w', encoding='utf-8') as f:
    f.write(full_text)

print("Extraction complete. Raw text saved to haggadah_full_raw.txt")
