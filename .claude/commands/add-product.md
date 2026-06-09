# /project:add-product

Add a new product to the TikTok pipeline queue for content generation.

## Usage

```
/project:add-product [product_name] [category]
```

Example: `/project:add-product "Jade Roller" "skincare"`

## Steps

### 1. Accept Product Input

Parse the product name and category from the command arguments:
- **Product name** — can include brand name (e.g., "L'Oreal Revitalift Serum")
- **Category** — one of: skincare, health, home, gadget, food, fashion, beauty, fitness

If category is not provided, attempt to infer it from the product name. If uncertain, ask.

### 2. Validate TikTok Appropriateness

Before adding, check the product against TikTok community guidelines and Malaysian market fit:

**Prohibited products (reject immediately):**
- Alcohol, tobacco, e-cigarettes
- Gambling or betting products
- Prescription drugs or medical devices that require a prescription
- Weapons or dangerous items
- Products making unverified health claims (e.g., "cure cancer", "100% weight loss")
- Multi-level marketing (MLM) products

**Malaysian market suitability check:**
- Is the product available on Shopee Malaysia or Lazada Malaysia?
- Does it appeal to Malaysian demographics (18–35, value-conscious)?
- Can a BM script be written for it naturally?
- Is the price point realistic for Malaysian purchasing power (RM20–RM200 sweet spot)?

If the product fails any check, explain why and suggest an alternative.

### 3. Generate Product Entry

Create a product entry object in the format expected by `tiktok-screen.tsx`:

```typescript
const newProduct = {
  name: "Jade Roller",
  price: "RM49.90",          // Always in RM
  trendScore: 0,             // Will be set by TrendHunter
  viralReason: "",           // Will be set by TrendHunter
  category: "skincare",
  addedAt: new Date().toISOString(),
  status: "queued"
}
```

### 4. Add to Product Queue

Check if `src/data/product-queue.ts` exists. If yes, append the new product. If not, create it:

```typescript
// src/data/product-queue.ts
export const productQueue = [
  // existing products...
  {
    name: "Jade Roller",
    price: "RM49.90",
    category: "skincare",
    addedAt: "2026-06-09T00:00:00Z",
    status: "queued" as const
  }
]
```

### 5. Update Demo Data (if needed)

If this is a high-priority product that should be used as the demo fallback, update `DEMO_PRODUCT` and `DEMO_SCRIPT` in `tiktok-screen.tsx`:

```typescript
const DEMO_PRODUCT: Product = {
  name: 'Jade Roller',
  price: 'RM49.90',
  trendScore: 88,
  viralReason: 'Jade roller trending +210% on TikTok Malaysia this week — natural skincare resonates with conscious beauty consumers'
}
```

### 6. Trigger Pipeline (Optional)

If the user confirms, automatically trigger the pipeline for the new product by navigating to `/tiktok` and pre-filling the product data.

### 7. Confirm Addition

Output:
- Product added: [name] ([category])
- Price: [RM amount]
- TikTok suitability: Approved / Rejected (reason)
- Queue position: #[n]
- Next step: Run `/project:run-pipeline "[product_name]"` to generate content
