# Smart Copy Page — AI-Assisted Chrome Extension Spec

## 1. Product Summary

Build a Chrome extension that lets a user quickly copy the “useful structured data” from the current webpage without manually defining selectors or patterns.

The primary user is busy and does not want to configure a scraper. The extension should automatically detect the most likely repeated data structure on the page, infer useful fields, extract the data locally, and let the user copy it as JSON, CSV, or Markdown.

The product should feel like:

> “Copy the useful data from this page.”

Not:

> “Build a scraper.”

Core principle:

```txt
Auto first.
Ask only when ambiguity exists.
Click-example fallback for hard pages.
```

The model should help decide what the user probably wants, label candidate groups in human terms, and infer fields. Local deterministic code should still perform the actual extraction.

---

## 2. Target User

Primary user:

```txt
Busy developer / operator / researcher / founder who is looking at a page and wants the obvious list/table/cards copied quickly.
```

The user should not have to:

```txt
- inspect HTML
- define CSS selectors
- train a scraper
- manually identify repeating DOM structures
- know what XPath/CSS paths are
```

Expected use cases:

```txt
- Product grids
- Search results
- Marketplace listings
- Directory listings
- Blog/article indexes
- Tables
- Review lists
- Job listings
- Vendor/contact lists
- Real estate listings
- Event lists
```

---

## 3. Product Positioning

Working product name:

```txt
Smart Copy Page
```

Main button:

```txt
Copy Useful Data
```

Avoid exposing “scraper” language in the primary UI. Use scraper terminology only in advanced/debug views.

Good user-facing language:

```txt
Copy Useful Data
Detected product cards
Found 24 items
Choose what you want to copy
Click one example item
```

Avoid primary UI language like:

```txt
CSS selector
XPath
DOM pattern
Scrape recipe
Extraction plan
```

---

## 4. High-Level UX

### 4.1 Normal Flow: Auto-First

User opens a webpage and clicks the extension.

Popup shows:

```txt
[ Copy Useful Data ]
```

On click:

```txt
Scanning page...
Finding useful data...
Detected Product Cards — 24 items
Fields: title, price, url, image, rating

[ Copy CSV ] [ Copy JSON ] [ Copy Markdown ]
```

If confidence is high, the extension should not ask the user which pattern they want. It should select the obvious candidate automatically.

---

### 4.2 Ambiguous Flow: Quick Choice

If multiple plausible patterns exist, show a simple chooser.

Example:

```txt
I found a few possible data groups:

[ Product cards ] 24 items
Makita Drill Kit · $129 · 4.7 stars
Fields: title, price, image, url

[ Reviews ] 18 items
"Great product..." · John · 5 stars
Fields: rating, author, review_text, date

[ Related products ] 8 items
Ryobi Saw · $89
Fields: title, price, image

Which one do you want to copy?
```

User clicks one candidate, then the extension extracts and shows copy buttons.

The chooser should be visual and human-readable. It should not show CSS selectors by default.

---

### 4.3 Hard Page Flow: Click Example

If the extension cannot confidently identify the desired data group, show:

```txt
I couldn’t confidently tell what data you wanted.

[ Click One Example Item ]
```

Then:

1. Page enters selection mode.
2. User clicks one item, card, title, row, or result.
3. Extension walks up the DOM tree to find the repeated parent pattern.
4. Extension highlights similar items.
5. User confirms:

```txt
Found 24 similar items.

[ Looks Good ] [ Try Again ]
```

Then AI detects fields and the extension extracts locally.

Click-example mode is a fallback, not the primary workflow.

---

## 5. Core Product Philosophy

The extension should optimize for:

```txt
Minimum user effort
Maximum “obvious thing” detection
Fast clipboard output
Graceful fallback when ambiguous
```

The main challenge is not only detecting repeated DOM patterns. It is detecting the repeated pattern the human likely wants.

So the system should rank candidates by:

```txt
main content likelihood
usefulness of fields
visible prominence
semantic value
human intent probability
```

Not merely by:

```txt
number of repeated elements
DOM similarity
class similarity
```

---

## 6. Architecture Overview

Use Chrome Extension Manifest V3.

```txt
Popup UI
  ↓
Content script scans current page
  ↓
Local candidate detector finds repeated structures
  ↓
Local ranker scores likely user intent
  ↓
If obvious:
      send best candidate skeleton to AI for field detection
  If ambiguous:
      send top candidates to AI for labels + recommended choice
      show chooser
  If low confidence:
      ask user to click one example
  ↓
AI returns structured scrape plan
  ↓
Content script executes selectors locally
  ↓
Result validation
  ↓
Preview + copy output
```

Suggested files:

```txt
extension/
  manifest.json
  src/
    popup/
      popup.html
      popup.tsx
      popup.css
    background/
      service-worker.ts
    content/
      domScanner.ts
      candidateDetector.ts
      candidateRanker.ts
      selectionMode.ts
      scrapeExecutor.ts
      overlayHighlighter.ts
    shared/
      types.ts
      schema.ts
      modelClient.ts
      validation.ts
      csv.ts
      markdown.ts
      selectors.ts
      textUtils.ts
```

Suggested stack:

```txt
- TypeScript
- React optional for popup
- Vite / WXT / Plasmo acceptable
- Chrome Manifest V3
- OpenAI API with structured JSON outputs
```

---

## 7. Primary Workflow Logic

The extension should use three confidence states:

```txt
High confidence:
  Auto-select top candidate and proceed.

Medium confidence:
  Show candidate chooser.

Low confidence:
  Ask user to click one example item.
```

Recommended thresholds:

```txt
topScore >= 0.78 and topScore - secondScore >= 0.15
  → auto-select

topScore >= 0.50 but candidates are close
  → show chooser

topScore < 0.50
  → click-example fallback
```

These thresholds should be configurable constants.

Pseudo-code:

```ts
function decideFlow(candidates: Candidate[]): DetectionDecision {
  const sorted = candidates.sort((a, b) => b.score.total - a.score.total);
  const top = sorted[0];
  const second = sorted[1];

  if (!top) {
    return { mode: "click_example" };
  }

  const gap = second ? top.score.total - second.score.total : 1;

  if (top.score.total >= 0.78 && gap >= 0.15) {
    return {
      mode: "auto",
      candidate: top
    };
  }

  if (top.score.total >= 0.5) {
    return {
      mode: "choose",
      candidates: sorted.slice(0, 4)
    };
  }

  return { mode: "click_example" };
}
```

---

## 8. Candidate Detection

The content script should identify repeated DOM structures.

Candidate groups can come from:

```txt
- sibling elements with similar structure
- table rows
- repeated cards in grids
- repeated articles
- repeated list items
- repeated search-result containers
```

Potential repeated containers:

```txt
article
li
tr
.card
.result
.product
.listing
.grid > div
section > div
main > div > div
```

The detector should ignore:

```txt
script
style
noscript
svg
canvas
template
hidden elements
cookie banners
modals, unless user selected them
nav menus
headers
footers
sidebars, unless likely main result area
```

Candidate must usually have:

```txt
- 3 or more repeated items
- visible area
- similar structure
- useful content
- varied text between items
```

---

## 9. Human-Intent Candidate Ranking

Each candidate should receive a composite score.

```ts
type CandidateScore = {
  total: number;
  repeatScore: number;
  structureScore: number;
  contentUsefulnessScore: number;
  mainContentScore: number;
  antiChromePenalty: number;
  ambiguityPenalty: number;
};
```

### 9.1 Positive Signals

Score higher when the candidate:

```txt
- appears inside main, article, section, or central content
- has repeated cards/rows
- has 3–100 items
- has varied text across items
- contains links
- contains images
- contains price-like text
- contains rating-like text
- contains date-like text
- contains address-like text
- contains title/name-like text
- has medium-to-large visible area
- appears near the center of viewport
- has repeated child fields
- contains a useful mix of text + href/image/metadata
```

### 9.2 Negative Signals

Score lower when the candidate:

```txt
- is inside header/nav/footer
- is a menu
- is a filter sidebar
- is a list of buttons
- is a cookie banner
- is a modal unrelated to page content
- has mostly identical text
- has very short repeated labels
- has no links/images/useful fields
- has too many items, e.g. hundreds/thousands
- has tiny visible area
- is mostly icons
- is mostly form controls
```

### 9.3 Main Content Heuristics

Add score if candidate is under:

```css
main
[role="main"]
article
section
#content
.content
.results
.search-results
.product-grid
.listings
```

Subtract score if candidate is under:

```css
header
footer
nav
aside
[role="navigation"]
[role="banner"]
[role="contentinfo"]
```

---

## 10. Candidate Labels

The model should help turn candidate groups into human labels.

Examples:

```txt
Product cards
Search results
Review rows
Related products
Blog posts
Job listings
Directory entries
Table rows
Event listings
People/contact cards
```

The chooser should display labels, not selectors.

Candidate card UI should include:

```txt
- human label
- item count
- field guesses
- 1–3 sample rows
- confidence
```

Example:

```txt
Product cards — 24 items
Sample: Makita Drill Kit · $129 · 4.7 stars
Fields: title, price, url, image, rating
```

---

## 11. DOM Skeleton Sent to AI

The extension should not send full HTML.

Send a compact candidate summary.

Example:

```json
{
  "page": {
    "url": "https://example.com/products",
    "title": "Products",
    "hostname": "example.com"
  },
  "decisionMode": "auto_or_choose",
  "candidates": [
    {
      "candidateId": "c1",
      "localLabelGuess": "product cards",
      "itemSelector": "main .product-grid > div.product-card",
      "containerSelector": "main .product-grid",
      "repeatCount": 24,
      "localScore": 0.86,
      "visibleArea": {
        "averageWidth": 260,
        "averageHeight": 340
      },
      "locationHints": {
        "insideMain": true,
        "insideNav": false,
        "insideFooter": false
      },
      "sampleRows": [
        "Makita Drill Kit $129.00 4.7 stars Add to cart",
        "DeWalt Impact Driver $89.99 4.5 stars Add to cart",
        "Ryobi Saw $149.00 4.6 stars Add to cart"
      ],
      "commonChildren": [
        {
          "relativeSelector": "h2.product-title",
          "tag": "h2",
          "className": "product-title",
          "textSamples": ["Makita Drill Kit", "DeWalt Impact Driver"]
        },
        {
          "relativeSelector": ".price",
          "tag": "span",
          "className": "price",
          "textSamples": ["$129.00", "$89.99"]
        },
        {
          "relativeSelector": "a",
          "tag": "a",
          "attrs": {
            "hrefSamples": ["/p/makita-drill", "/p/dewalt-impact"]
          }
        },
        {
          "relativeSelector": "img",
          "tag": "img",
          "attrs": {
            "altSamples": ["Makita Drill Kit", "DeWalt Impact Driver"],
            "srcSamples": ["https://example.com/img1.jpg"]
          }
        }
      ]
    }
  ]
}
```

Text sampling limits:

```txt
- Max 3 sample rows per candidate
- Max 120 characters per sample row
- Max 3 samples per child field
- Avoid long paragraphs
- Avoid form-entered user text
- Avoid hidden content by default
```

---

## 12. AI Responsibilities

The AI should do four things:

```txt
1. Label candidates in human terms.
2. Decide whether the top candidate is likely the intended one.
3. Infer useful fields inside the selected candidate.
4. Return a strict JSON scrape plan.
```

AI should not:

```txt
- scrape every row
- return final data
- invent nonexistent fields
- use arbitrary JS
- rely on hidden content
- output prose outside the JSON schema
```

---

## 13. Structured Model Output

The model should return:

```ts
type SmartCopyPlan = {
  version: "1.0";
  mode: "auto_selected" | "needs_user_choice" | "needs_click_example";
  recommendedCandidateId?: string | null;
  candidates: CandidateSummary[];
  scrapePlan?: ScrapePlan | null;
  warnings: string[];
};

type CandidateSummary = {
  candidateId: string;
  label: string;
  confidence: number;
  itemCount: number;
  sampleSummary: string;
  likelyFields: string[];
  reason: string;
};

type ScrapePlan = {
  candidateId: string;
  itemSelector: string;
  fields: ScrapeField[];
  pagination?: PaginationPlan | null;
};

type ScrapeField = {
  name: string;
  label: string;
  selector: string;
  selectorScope: "item" | "document";
  type: "text" | "attribute" | "html" | "absolute_url";
  attribute?: string | null;
  multiple: boolean;
  required: boolean;
  transform?: "trim" | "normalize_whitespace" | "currency" | "number" | "date" | null;
  fallbackSelectors: string[];
};

type PaginationPlan = {
  strategy: "none" | "click" | "href";
  nextSelector?: string | null;
  maxPagesRecommended?: number;
};
```

For high-confidence auto mode, the model should return:

```json
{
  "version": "1.0",
  "mode": "auto_selected",
  "recommendedCandidateId": "c1",
  "candidates": [
    {
      "candidateId": "c1",
      "label": "Product cards",
      "confidence": 0.9,
      "itemCount": 24,
      "sampleSummary": "Makita Drill Kit · $129 · 4.7 stars",
      "likelyFields": ["title", "price", "rating", "url", "image"],
      "reason": "This is the main repeated product grid in the page content."
    }
  ],
  "scrapePlan": {
    "candidateId": "c1",
    "itemSelector": "main .product-grid > div.product-card",
    "fields": [
      {
        "name": "title",
        "label": "Title",
        "selector": ".product-title",
        "selectorScope": "item",
        "type": "text",
        "attribute": null,
        "multiple": false,
        "required": true,
        "transform": "normalize_whitespace",
        "fallbackSelectors": ["h2", "h3", "a"]
      },
      {
        "name": "price",
        "label": "Price",
        "selector": ".price",
        "selectorScope": "item",
        "type": "text",
        "attribute": null,
        "multiple": false,
        "required": false,
        "transform": "normalize_whitespace",
        "fallbackSelectors": ["[class*='price']"]
      },
      {
        "name": "url",
        "label": "URL",
        "selector": "a",
        "selectorScope": "item",
        "type": "absolute_url",
        "attribute": "href",
        "multiple": false,
        "required": false,
        "transform": null,
        "fallbackSelectors": []
      }
    ],
    "pagination": {
      "strategy": "none"
    }
  },
  "warnings": []
}
```

For ambiguity mode:

```json
{
  "version": "1.0",
  "mode": "needs_user_choice",
  "recommendedCandidateId": null,
  "candidates": [
    {
      "candidateId": "c1",
      "label": "Product cards",
      "confidence": 0.76,
      "itemCount": 24,
      "sampleSummary": "Makita Drill Kit · $129 · 4.7 stars",
      "likelyFields": ["title", "price", "rating", "url", "image"],
      "reason": "Likely main product results."
    },
    {
      "candidateId": "c2",
      "label": "Reviews",
      "confidence": 0.72,
      "itemCount": 18,
      "sampleSummary": "Great product · John · 5 stars",
      "likelyFields": ["rating", "author", "review_text", "date"],
      "reason": "Also a plausible repeated data group."
    }
  ],
  "scrapePlan": null,
  "warnings": ["Multiple plausible data groups were found."]
}
```

---

## 14. Prompting

### 14.1 System Prompt

```txt
You are an expert web data extraction planner. You receive compact DOM candidate summaries, not the full page HTML. Your job is to identify the repeated data group a busy user most likely wants to copy, label candidate groups in human language, and return a structured scrape plan.

Do not scrape rows.
Do not invent data.
Do not output prose outside the required JSON.
Prefer the main useful page content over nav, footer, filters, menus, and related links.
If one candidate is clearly dominant, return mode "auto_selected" with a scrape plan.
If multiple candidates are plausible, return mode "needs_user_choice" and summarize the choices.
If no candidate is good enough, return mode "needs_click_example".
```

### 14.2 User Prompt

```txt
Analyze these repeated DOM candidates from the current webpage.

Goal:
Help a busy user copy the useful structured data from the page with minimal effort.

Rules:
- Prefer the main content area.
- Prefer product cards, search results, listings, tables, reviews, jobs, events, directories, or article lists.
- Penalize nav links, footer links, filter controls, menus, sidebars, and cookie banners.
- If the best candidate is obvious, auto-select it and return a scrape plan.
- If multiple candidates are close, return choices for the user.
- If none are good, request click-example fallback.
- Field selectors should usually be relative to each item.
- Do not return scraped rows.
- Return only JSON matching the schema.

DOM candidates:
{...}
```

---

## 15. Candidate Chooser UI

Only show this when mode is `needs_user_choice`.

Candidate chooser should display:

```txt
I found a few possible data groups. Which one do you want?
```

Each candidate card:

```txt
[Label] — [item count] items
Sample: [sampleSummary]
Fields: title, price, url, image
[Use This]
```

When hovering over a candidate, highlight matched items on the actual webpage.

When user clicks “Use This”:

```txt
- Use selected candidateId.
- Request or generate scrapePlan for that candidate.
- Execute locally.
- Show preview.
```

Implementation option:

If the first AI call returned only candidate summaries, make a second AI call for the selected candidate to get the exact scrape plan.

Alternative:

Ask AI to return scrape plans for all top candidates. This uses more tokens but gives faster UX after selection.

Recommended MVP:

```txt
Return summaries for ambiguous mode first.
Generate scrape plan after user chooses.
```

---

## 16. Click-Example Fallback

Selection mode behavior:

```txt
1. User clicks "Click One Example Item."
2. Extension overlays hover outlines on elements.
3. User clicks a visible item/card/row/title.
4. Extension captures clicked element.
5. Extension walks up ancestors.
6. For each ancestor, compare it with siblings.
7. Select the ancestor whose siblings form the best repeated group.
8. Highlight detected similar items.
9. Ask user to confirm.
```

Ancestor search:

```ts
function findRepeatedAncestor(clickedEl: Element): RepeatedGroup | null {
  let current: Element | null = clickedEl;

  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;

    const siblings = Array.from(parent.children);
    const similar = siblings.filter(sib =>
      structuralSimilarity(current!, sib) >= 0.7
    );

    if (similar.length >= 3) {
      return {
        itemElement: current,
        parent,
        siblings: similar
      };
    }

    current = parent;
  }

  return null;
}
```

Similarity signals:

```txt
- tag name
- class overlap
- child tag sequence
- number of links
- number of images
- number of text nodes
- approximate visible size
- role/aria similarity
- presence of similar field-like children
```

After the repeated group is found, build a candidate skeleton and send it to AI for field detection.

---

## 17. Scrape Execution

The scrape should run locally in the content script.

Pseudo-code:

```ts
function executeScrapePlan(plan: ScrapePlan): ScrapeResult {
  const items = Array.from(document.querySelectorAll(plan.itemSelector));

  const rows = items.map((item) => {
    const row: Record<string, unknown> = {};

    for (const field of plan.fields) {
      const scope = field.selectorScope === "document" ? document : item;
      const elements = Array.from(scope.querySelectorAll(field.selector));
      const selected = field.multiple ? elements : elements.slice(0, 1);

      let value = extractValue(selected, field);

      if (isEmpty(value) && field.fallbackSelectors.length) {
        value = tryFallbackSelectors(item, field);
      }

      row[field.name] = value;
    }

    return row;
  });

  return {
    rows,
    plan,
    meta: {
      url: location.href,
      title: document.title,
      rowCount: rows.length,
      fieldCount: plan.fields.length,
      extractedAt: new Date().toISOString()
    }
  };
}
```

Value extraction:

```ts
function extractValue(elements: Element[], field: ScrapeField): unknown {
  const values = elements.map(el => {
    if (field.type === "text") {
      return normalizeWhitespace(
        (el as HTMLElement).innerText || el.textContent || ""
      );
    }

    if (field.type === "html") {
      return (el as HTMLElement).innerHTML;
    }

    if (field.type === "attribute") {
      return field.attribute ? el.getAttribute(field.attribute) : null;
    }

    if (field.type === "absolute_url") {
      const raw = field.attribute ? el.getAttribute(field.attribute) : null;
      return raw ? new URL(raw, location.href).href : null;
    }

    return null;
  }).filter(v => v != null && v !== "");

  return field.multiple ? values : values[0] ?? null;
}
```

---

## 18. Validation

After local extraction, validate.

Checks:

```txt
- itemSelector matched at least 2 rows.
- At least one field has useful non-empty values.
- Required fields are non-empty in at least 50% of rows.
- Field values are not all identical unless expected.
- No field contains the entire page text.
- Average field length is reasonable.
- Row count is not absurdly large.
```

If validation passes:

```txt
Show preview + copy buttons.
```

If validation fails:

```txt
Retry once with AI correction.
```

Correction payload:

```json
{
  "candidateSkeleton": "...",
  "failedPlan": "...",
  "validationIssues": [
    "title field empty in all rows",
    "itemSelector matched only 1 element"
  ],
  "sampleOutput": [
    {
      "title": null,
      "price": "Makita Drill Kit $129 Add to cart"
    }
  ]
}
```

Prompt:

```txt
The previous scrape plan failed validation. Return a corrected plan for the same candidate. Do not extract rows. Use only the candidate skeleton and validation feedback.
```

If retry fails:

```txt
I found a possible data group, but the extraction did not look reliable.

[ Choose Another Group ] [ Click One Example Item ]
```

---

## 19. Output Formats

### 19.1 JSON

```json
[
  {
    "title": "Makita Drill Kit",
    "price": "$129.00",
    "url": "https://example.com/p/makita-drill"
  }
]
```

### 19.2 CSV

Requirements:

```txt
- Header row
- Stable column order from plan.fields
- Escape quotes
- Quote values with commas/newlines
```

Example:

```csv
title,price,url
"Makita Drill Kit","$129.00","https://example.com/p/makita-drill"
```

### 19.3 Markdown Table

```md
| title | price | url |
|---|---|---|
| Makita Drill Kit | $129.00 | https://example.com/p/makita-drill |
```

Markdown table escaping:

```txt
- Escape pipe characters
- Replace newlines with spaces or <br>
```

---

## 20. Popup UI Requirements

### 20.1 Main State

```txt
Smart Copy Page

[ Copy Useful Data ]

Output:
(•) CSV
( ) JSON
( ) Markdown

[ Settings ]
```

### 20.2 Scanning State

```txt
Scanning page...
Finding useful repeated data...
```

### 20.3 Auto Success State

```txt
Detected Product Cards
24 items · 5 fields

Fields:
title, price, rating, url, image

[ Copy CSV ] [ Copy JSON ] [ Copy Markdown ]

Preview:
...
```

### 20.4 Ambiguous State

```txt
I found a few possible data groups.

[ Product Cards ] 24 items
Makita Drill Kit · $129 · 4.7 stars
Fields: title, price, rating, url

[ Reviews ] 18 items
Great product · John · 5 stars
Fields: rating, author, review_text

[ Related Products ] 8 items
Ryobi Saw · $89
Fields: title, price, image
```

### 20.5 Failed State

```txt
I couldn’t confidently tell what data you wanted.

[ Click One Example Item ]
[ Try Auto Again ]
```

---

## 21. Overlay / Highlight Requirements

When candidate chooser is open:

```txt
- Hovering a candidate highlights matching items on page.
- Selected candidate remains highlighted.
- Highlight should not disrupt layout.
```

Suggested overlay:

```txt
- outline around each matched item
- small floating label: “Product Cards — 24 items”
```

Do not permanently modify the page.

---

## 22. Settings

Settings:

```ts
type Settings = {
  provider: "openai";
  apiKey: string;
  model: string;
  defaultOutputFormat: "csv" | "json" | "markdown";
  autoCopyWhenHighConfidence: boolean;
  maxCandidatesSent: number;
  maxSampleTextLength: number;
  fullPageScan: boolean;
  includeImages: boolean;
  includeLinks: boolean;
  debugMode: boolean;
};
```

Recommended defaults:

```json
{
  "provider": "openai",
  "model": "gpt-4.1-mini",
  "defaultOutputFormat": "csv",
  "autoCopyWhenHighConfidence": false,
  "maxCandidatesSent": 5,
  "maxSampleTextLength": 120,
  "fullPageScan": true,
  "includeImages": true,
  "includeLinks": true,
  "debugMode": false
}
```

Note on `autoCopyWhenHighConfidence`:

For MVP, even if high-confidence, show preview first. Later, allow true one-click auto-copy.

---

## 23. Chrome Extension Permissions

Manifest V3 permissions:

```json
{
  "permissions": [
    "activeTab",
    "scripting",
    "storage",
    "clipboardWrite"
  ],
  "host_permissions": []
}
```

Use `activeTab` to avoid broad permissions. The extension should only scan after user action.

---

## 24. Security Requirements

```txt
- Never eval model output.
- Never execute model-generated JavaScript.
- Treat selectors as untrusted strings.
- Catch invalid selector errors.
- Do not expose API key to content scripts if possible.
- Do not inject unsanitized model-generated HTML into popup.
- Allow only known extraction types.
- Allow only safe attribute names.
```

Allowed extraction types:

```txt
text
attribute
html
absolute_url
```

Allowed attributes:

```txt
href
src
alt
title
datetime
aria-label
content
data-* optionally
```

---

## 25. Privacy Requirements

By default, do not send:

```txt
- full raw HTML
- cookies
- localStorage
- sessionStorage
- request headers
- auth tokens
- long page text
- hidden DOM
- form-entered user text
```

Send only:

```txt
- URL hostname/path
- page title
- compact candidate summaries
- short text samples
- safe attribute samples
- structural hints
```

The popup settings page should say:

```txt
Smart Copy sends a compact page-structure summary to your selected AI provider. It does not send cookies, storage, or full page HTML.
```

---

## 26. Error Handling

Handle:

```txt
- missing API key
- invalid API key
- model/API failure
- no candidates found
- ambiguous candidates
- invalid selector returned
- extraction validation failed
- clipboard write failed
- restricted Chrome page
- page blocks script injection
```

User-facing errors:

```txt
Missing API key. Add your OpenAI key in Settings.

No useful repeated data found. Try clicking one example item.

I found several possible data groups. Choose one to copy.

The detected fields did not extract reliably. Try another group or click an example item.

Could not copy to clipboard. You can manually copy from the preview.
```

---

## 27. Build Phases

### Phase 1 — Local candidate detection

Build:

```txt
- Extension shell
- DOM scanner
- Repeated structure detector
- Candidate ranker
- Candidate chooser with sample rows
- Highlight candidates on hover
```

No AI yet.

Goal:

```txt
Given a page, show top likely repeated groups in a human-readable chooser.
```

---

### Phase 2 — AI candidate labeling + field detection

Build:

```txt
- API key settings
- Compact candidate skeleton
- AI candidate labeling
- Structured scrape plan output
- Local scrape execution
- Preview table
```

Goal:

```txt
Click Copy Useful Data and get useful fields from the most likely candidate.
```

---

### Phase 3 — Auto-first decision logic

Build:

```txt
- High/medium/low confidence thresholds
- Auto-select obvious candidate
- Show chooser only when ambiguous
- Click-example fallback when low confidence
```

Goal:

```txt
Most pages require only one click.
```

---

### Phase 4 — Validation and retry

Build:

```txt
- Extraction validation
- AI correction retry
- Better field stats
- Better failure states
```

Goal:

```txt
Reduce bad copy results.
```

---

### Phase 5 — Convenience features

Build:

```txt
- Saved extraction recipes by hostname/path
- True one-click auto-copy
- Pagination detection
- Optional pagination extraction
- Field editor
- Column rename/reorder
```

---

## 28. MVP Acceptance Criteria

MVP is complete when:

```txt
1. User can save an OpenAI API key.
2. User can click “Copy Useful Data.”
3. Extension scans the page after user action.
4. Extension finds repeated candidate groups.
5. Extension ranks likely human-intended data groups.
6. If one candidate is obvious, it proceeds automatically.
7. If multiple candidates are plausible, it shows a human-readable chooser.
8. User can hover candidates and see page highlights.
9. AI returns field selectors for the selected candidate.
10. Extension extracts data locally.
11. User sees a preview.
12. User can copy CSV, JSON, or Markdown.
13. If confidence is low, user can click one example item.
14. Extension does not send full raw HTML by default.
15. Extension handles failure gracefully.
```

---

## 29. Key Implementation Advice

The hardest part is not the AI call. The hardest part is producing good candidate summaries.

Build in this order:

```txt
1. DOM scanner
2. Candidate detector
3. Candidate scorer/ranker
4. Candidate chooser/highlighter
5. AI field detection
6. Local extraction
7. Validation/retry
```

Do not start by sending the whole page to AI.

The best version is:

```txt
Local code finds plausible repeated groups.
AI decides what those groups represent and extracts fields.
Local code performs the scrape.
User gets clipboard output.
```

The product should feel like magic, but technically it should be conservative, inspectable, and locally validated.
