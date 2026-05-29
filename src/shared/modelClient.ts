import type { Candidate } from './types';

export type CandidateSummary = {
  candidateId: string;
  label: string;
  confidence: number;
  itemCount: number;
  sampleSummary: string;
  likelyFields: string[];
  reason: string;
};

export type ScrapeField = {
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

export type ScrapePlan = {
  candidateId: string;
  itemSelector: string;
  fields: ScrapeField[];
  pagination?: {
    strategy: "none" | "click" | "href";
    nextSelector?: string | null;
    maxPagesRecommended?: number;
  } | null;
};

export type SmartCopyPlan = {
  version: "1.0";
  mode: "auto_selected" | "needs_user_choice" | "needs_click_example";
  recommendedCandidateId?: string | null;
  candidates: CandidateSummary[];
  scrapePlan?: ScrapePlan | null;
  warnings: string[];
};

export async function askAiForPlan(candidates: Candidate[]): Promise<SmartCopyPlan> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['apiKey', 'model'], async (items) => {
      const apiKey = items.apiKey;
      const model = items.model || 'gpt-4o-mini';

      if (!apiKey) {
        return reject(new Error('Missing OpenAI API Key'));
      }

      const prompt = `
Analyze these repeated DOM candidates from the current webpage.
Goal: Help a busy user copy the useful structured data from the page with minimal effort.

Rules:
- Prefer the main content area.
- Prefer product cards, search results, listings, tables, reviews, jobs, events, directories, or article lists.
- Penalize nav links, footer links, filter controls, menus, sidebars, and cookie banners.
- If the best candidate is obvious, auto-select it and return a scrape plan.
- If multiple candidates are close, return choices for the user.
- If none are good, request click-example fallback.
- Field selectors should usually be relative to each item.
- Do not return scraped rows.
- Return EXACTLY the JSON structure described below. No other keys.

EXPECTED JSON SCHEMA:
{
  "version": "1.0",
  "mode": "auto_selected" | "needs_user_choice" | "needs_click_example",
  "recommendedCandidateId": "c1",
  "candidates": [
    {
      "candidateId": "c1",
      "label": "Product cards",
      "confidence": 0.9,
      "itemCount": 24,
      "sampleSummary": "Sample text",
      "likelyFields": ["title", "price", "url"],
      "reason": "Why chosen"
    }
  ],
  "scrapePlan": {
    "candidateId": "c1",
    "itemSelector": "...",
    "fields": [
      {
        "name": "title",
        "label": "Title",
        "selector": ".title",
        "selectorScope": "item",
        "type": "text", // or "attribute" | "absolute_url"
        "attribute": null, // or "href"
        "multiple": false,
        "required": true,
        "transform": "normalize_whitespace",
        "fallbackSelectors": []
      }
    ],
    "pagination": { "strategy": "none" }
  },
  "warnings": []
}

Candidates:
${JSON.stringify(candidates.slice(0, 5), null, 2)}
      `;

      console.log('Sending candidates to AI:', candidates.slice(0, 5));

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are an expert web data extraction planner. You receive compact DOM candidate summaries, not the full page HTML. Your job is to identify the repeated data group a busy user most likely wants to copy, label candidate groups in human language, and return a structured scrape plan. Return strictly valid JSON.'
              },
              { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) {
          throw new Error('API Error: ' + response.statusText);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;
        console.log('Raw AI Response Content:', content);
        
        let plan: SmartCopyPlan;
        try {
          plan = JSON.parse(content) as SmartCopyPlan;
          console.log('Parsed AI Plan:', plan);
        } catch (parseErr) {
          console.error('Failed to parse AI JSON response:', content);
          return reject(parseErr);
        }
        
        resolve(plan);
      } catch (err) {
        reject(err);
      }
    });
  });
}
