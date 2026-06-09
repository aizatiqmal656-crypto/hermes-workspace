# /project:translate-bm

Check and fix any English text in generated scripts, ensuring authentic Bahasa Malaysia with Malaysian slang.

## Usage

```
/project:translate-bm [optional: paste script text here]
```

If no text is provided, reads the latest generated script from `tiktok-screen.tsx` DEMO_SCRIPT or asks the user to paste their script.

## Steps

### 1. Scan Latest Generated Script

Check the script for English phrases. A valid BM TikTok script should be 90%+ Bahasa Malaysia. Acceptable English: product names, brand names, prices (RM), numbers, hashtags.

**Red flags (must translate):**
- Full English sentences
- "Click the link in bio" (not BM)
- "Don't miss out" (not BM)
- "Limited stock" in English
- English CTA phrases
- "You need to try this" (not BM)

### 2. Translate to Proper BM + Malaysian Slang

Apply these translation rules:

**Standard phrases → BM equivalents:**

| English | BM (Formal) | BM (Malaysian Slang) |
|---------|-------------|----------------------|
| "You need to try this" | "Anda perlu mencuba ini" | "Korang wajib cuba ni!" |
| "Limited stock" | "Stok terhad" | "Stok dah nak abis!" |
| "Click the link in bio" | "Klik pautan di bio" | "Link ada kat bio, jom grab!" |
| "Don't miss out" | "Jangan lepaskan peluang" | "Jangan menyesal tak ambil!" |
| "Affordable price" | "Harga berpatutan" | "Harga memang berbaloi gila!" |
| "High quality" | "Berkualiti tinggi" | "Kualiti memang power!" |
| "Best seller" | "Penjual terbaik" | "Dah jadi viral kat TikTok!" |
| "Works great" | "Berfungsi dengan baik" | "Confirm berjaya, dah ramai dah cuba!" |
| "Amazing results" | "Hasil yang menakjubkan" | "Hasilnya memang gila mantap!" |
| "Comment below" | "Komen di bawah" | "Komen sekarang!" |
| "Share with friends" | "Kongsi dengan kawan" | "Jangan lupa share kat kawan-kawan!" |

### 3. Malaysian Slang Glossary

Ensure the script naturally uses these Malaysian expressions:

**Intensifiers:**
- `memang` — really, genuinely ("memang berbaloi")
- `confirm` — definitely, for sure ("confirm berjaya")
- `power` — excellent, impressive ("power betul kesan dia")
- `mantap` — awesome, solid ("mantap habis!")
- `gila` — extremely (colloquial intensifier, "gila best")
- `jeles` — jealous ("ramai yang jeles tengok result")

**Call to action words:**
- `jom` — let's go / come on ("jom dapatkan sekarang")
- `grab` — get/buy ("jom grab sebelum habis")
- `wajib` — must/obligatory ("korang wajib cuba ni")
- `berbaloi` — worth it ("memang berbaloi!")
- `rugi` — waste/loss ("rugi kalau tak cuba")

**Connectors and filler:**
- `tau` — you know / tag for emphasis ("best tau!")
- `kan` — right? / isn't it? ("mahal kan dekat spa")
- `lah` — softening particle ("cuba lah dulu")
- `ni` / `ni ha` — this one / here ("produk ni ha")
- `tu` — that one ("cara guna dia tu mudah je")

**Malaysian expressions for products:**
- `dah viral kat TikTok` — already gone viral on TikTok
- `ramai dah cuba` — many have already tried it
- `stok selalu habis` — stock always runs out
- `harga tak tipu` — price is legit / fair
- `memang berbaloi` — truly worth it
- `confirm tak menyesal` — definitely won't regret

### 4. Hook Guidelines (BM)

The hook must be in BM and start with one of:
- A question: "Korang tahu tak..." / "Dah cuba ke..." / "Kenapa korang masih..."
- A shocking statement: "RM49 je boleh buat..." / "Ramai tak tahu pasal ni..."
- POV scenario: "POV: Korang habis RM300 dekat spa tapi..." / "Scene: Bangun pagi tengok cermin..."

### 5. Body Guidelines (BM)

- Use short sentences (5–10 words each)
- Include social proof: "lebih 50,000 orang dah guna"
- Include a problem-solution arc: masalah → produk → keputusan
- Keep formal BM to minimum — write like you're talking to a kawan

### 6. CTA Guidelines (BM)

Malaysian TikTok CTAs that convert well:
```
✓ "Komen 'MAHU' dan saya akan DM link terus kepada korang!"
✓ "Link ada kat bio — jom grab sebelum stok habis!"
✓ "Save video ni dulu, baru korang decide!"
✓ "Kongsi dengan member yang nak cantik/sihat/jimat!"
✓ "Follow untuk tips lebih banyak macam ni!"
```

### 7. Output

Show the corrected script side-by-side:

```
BEFORE (English detected):
Hook: "POV: You spent $300 on facials but this $49 mask does the same thing"

AFTER (Fixed BM):
Hook: "POV: Korang dah habis RM300 dekat spa tapi mask RM49 ni buat benda yang sama 👇"

Changes made:
- "You spent" → "Korang dah habis"
- "$300" → "RM300"
- "$49" → "RM49"
- "does the same thing" → "buat benda yang sama"
```

List all changes made with before/after for each phrase.
