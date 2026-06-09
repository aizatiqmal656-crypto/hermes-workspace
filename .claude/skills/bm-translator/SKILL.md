# Skill: BM Translator

## Trigger Conditions

This skill activates when:
- English text is detected in a generated TikTok script that should be in Bahasa Malaysia
- The user runs `/project:translate-bm`
- A CopywriterAgent output contains English sentences (not just product names)
- A voiceover_text field in the storyboard contains English sentences
- The user pastes a script and asks for BM translation

## What This Skill Does

Scans generated TikTok scripts for English phrases, translates them to authentic Bahasa Malaysia with Malaysian slang, and ensures the final script sounds natural to a Malaysian TikTok audience — not like a formal translation.

Product names, brand names, prices (RM), and platform names (TikTok, Shopee) are preserved in their original form. Only the connective language and descriptive text is translated.

## English Detection Rules

**Count as ENGLISH (must translate):**
- Any complete English sentence
- English connective phrases: "and then", "because", "but wait", "the reason is"
- English descriptive words in place of BM: "amazing", "incredible", "limited time"
- English CTAs: "click the link", "comment below", "don't miss out"

**Count as ACCEPTABLE (keep as-is):**
- Product names: "AeroGlow LED Face Mask" (brand)
- Platform names: "TikTok", "Shopee", "Lazada", "Instagram"
- Prices with RM: "RM49.99", "RM300"
- Technical terms: "LED", "collagen", "hyaluronic acid" (no natural BM equivalent)
- Hashtags: #fyp, #viral, #skincare
- Common borrowed words fully naturalised in BM: "serum", "mask", "review"

## Translation Approach

### 1. Identify English Phrases

Scan the script line by line. Flag any phrase that is:
- In English
- Not a product name, brand, or price
- Would sound unnatural to a Malaysian TikTok creator

### 2. Apply Malaysian Slang Translation

Use the slang dictionary from `.claude/rules/bm-language.md`:

**Priority translations (must apply these):**

| English | Malaysian BM | Notes |
|---------|-------------|-------|
| "You need to try this" | "Korang wajib cuba ni!" | Use "korang" not "anda" |
| "Amazing results" | "Hasilnya memang power!" | Use "power" intensifier |
| "Don't miss out" | "Jangan lepaskan peluang ni!" | Or "Rugi kalau tak grab!" |
| "Limited stock" | "Stok dah nak abis!" | More urgent feel |
| "Click the link in bio" | "Link ada kat bio — jom grab!" | More conversational |
| "Comment below" | "Komen sekarang!" | Short, punchy |
| "It works" | "Memang berkesan!" | "Memang" adds conviction |
| "Worth it" | "Memang berbaloi!" | Classic Malaysian approval |
| "So good" | "Gila best la!" | Natural Malaysian exclamation |
| "Many people" | "Ramai yang dah cuba" | Specific social proof |
| "For sure" | "Confirm berjaya" | Borrowed English used in BM context |
| "Just 20 minutes" | "20 minit je sehari" | "je" minimiser adds ease |
| "Results in 2 weeks" | "Dalam masa 2 minggu je!" | Time + minimiser |

### 3. Preserve Script Structure

After translation, verify:
- Hook still starts with BM question or shocking statement
- Body still has the problem → product → proof structure
- CTA still drives one specific action
- Word count hasn't ballooned (translation should be ~same length or shorter)

### 4. BM Quality Check

After translation, score the output:
- **BM percentage:** should be >90% (excluding product names/brand names)
- **Slang naturalness:** Does it sound like a Malaysian talking to friends? (1–10)
- **Energy level:** TikTok needs high energy — does the BM maintain that? (1–10)

## Output Format

```
ORIGINAL (English detected):
──────────────────────────────────────────────────────
Hook: "POV: You spent $300 on facials but this $49 mask does the same thing 👇"
Body: "Red light therapy used to cost $200/session at spas. This AeroGlow mask brings clinical-grade LED technology home. Just 20 minutes, 3 times per week — users are reporting clearer skin in just 2 weeks."
CTA: "Comment 'GLOW' and I'll DM you the link! Save this before it sells out!"

TRANSLATED (Authentic BM):
──────────────────────────────────────────────────────
Hook: "POV: Korang dah habis RM300 dekat spa tapi mask RM49 ni buat benda yang sama 👇"
Body: "Rawatan red light therapy biasanya RM200 sesesi dekat spa. Mask AeroGlow ni bawa teknologi LED klinikal ke rumah korang. 20 minit je, tiga kali seminggu — ramai pengguna dah nampak kulit lebih cerah dalam masa 2 minggu."
CTA: "Komen 'GLOW' dan saya DM link terus! Save sebelum stok habis!"

CHANGES MADE:
─────────────────────────────────────
1. "$300" → "RM300", "$49" → "RM49", "$200" → "RM200" (currency)
2. "You spent" → "Korang dah habis" (informal second person)
3. "this mask does the same thing" → "mask ni buat benda yang sama" (natural BM word order)
4. "clinical-grade LED technology" → "teknologi LED klinikal" (BM with preserved technical term)
5. "Just 20 minutes" → "20 minit je" (je = minimiser, natural in BM)
6. "users are reporting" → "ramai pengguna dah nampak" (social proof framing)
7. "I'll DM you" → "saya DM" (natural BM shorthand)
8. "before it sells out" → "sebelum stok habis" (BM idiom)

BM QUALITY SCORE:
─────────────────
BM percentage: 94% ✓
Slang naturalness: 8/10
Energy level: 9/10
```

## Auto-Apply Mode

When this skill runs as part of the pipeline (not manually), it auto-applies translations silently and logs changes without showing the full comparison UI. Only show the comparison view when run via `/project:translate-bm` command.
