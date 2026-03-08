import urllib.request
import json

url = "https://www.sefaria.org/api/texts/Passover_Haggadah?context=0&commentary=0"

try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        
        with open('haggadah.json', 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            
        print("Successfully saved full Haggadah from Sefaria to haggadah.json")
except Exception as e:
    print(f"Error fetching: {e}")
