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
  mode: "auto_selected" | "multiple_datasets" | "needs_user_choice" | "needs_click_example";
  recommendedCandidateId?: string | null;
  candidates: CandidateSummary[];
  scrapePlans?: ScrapePlan[] | null;
  warnings: string[];
};

export async function askAiForPlan(candidates: Candidate[], userInstruction?: string, selectionHint?: string): Promise<SmartCopyPlan> {
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

First, classify what is on this page. There are TWO different situations and they must NOT be confused:
  (A) ALTERNATIVES — several candidates are competing guesses for the SAME data the user wants (e.g. the same list detected at different nesting levels, or it's ambiguous which list is "the" list). These are mutually-exclusive guesses; the right answer is to pick one.
  (B) DISTINCT DATASETS — the page contains MORE THAN ONE genuinely different kind of repeated record, each describing different things and therefore with DIFFERENT fields (e.g. a product grid AND a customer-reviews list AND a "related items" strip; or two different tables with different columns). These are NOT alternatives — the user may want any or all of them.

Rules:
- Prefer the main content area. Prefer product cards, search results, listings, tables, reviews, jobs, events, directories, or article lists.
- Penalize nav links, footer links, filter controls, menus, sidebars, and cookie banners.
- Choose ONE mode:
  - mode="auto_selected": exactly one useful dataset exists and it is obvious. Return its single scrape plan.
  - mode="multiple_datasets": situation (B) — multiple DISTINCT datasets exist. Return ONE scrapePlan for EACH distinct dataset, with fields tailored to that dataset. Different datasets WILL have different fields, and that is expected and correct.
  - mode="needs_user_choice": situation (A) — several close alternatives for the same intent and you cannot confidently pick. List them and include a scrapePlan for EACH listed candidate.
  - mode="needs_click_example": none of the candidates are useful.
- Do NOT collapse distinct datasets into one. Do NOT emit the same dataset multiple times as if it were several.
- IMPORTANT: every candidate you list in "candidates" must have a corresponding entry in "scrapePlans" with a matching candidateId.
- If the user instruction below names more than one kind of data, treat that as a strong signal for mode="multiple_datasets".
- Field selectors should usually be relative to each item.
- Do not return scraped rows.
- Return EXACTLY the JSON structure described below. No other keys.

${userInstruction ? `USER PREFERENCE/INSTRUCTION:\n"${userInstruction}"\n(Please adjust the field selections and candidate choice to best match this instruction if possible.)\n` : ''}
${selectionHint ? `USER TEXT SELECTION:\nThe user highlighted the following text on the page as an example of what they care about. Use it to infer WHICH dataset/candidate they want and WHICH fields to extract — the data they want likely matches, contains, or surrounds this text. Strongly prefer the candidate whose items contain this text.\n"""\n${selectionHint.slice(0, 2000)}\n"""\n` : ''}
EXPECTED JSON SCHEMA:
{
  "version": "1.0",
  "mode": "auto_selected" | "multiple_datasets" | "needs_user_choice" | "needs_click_example",
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
  "scrapePlans": [
    // One entry PER dataset (multiple_datasets) or PER listed candidate (needs_user_choice).
    {
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
    }
  ],
  "warnings": []
}

Candidates:
${JSON.stringify(candidates.slice(0, 8), null, 2)}
      `;

      console.log('Sending candidates to AI:', candidates.slice(0, 8));

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
          const rawPlan = JSON.parse(content);
          if (rawPlan.scrapePlan && (!rawPlan.scrapePlans || rawPlan.scrapePlans.length === 0)) {
            rawPlan.scrapePlans = [rawPlan.scrapePlan];
          }
          plan = rawPlan as SmartCopyPlan;
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

export async function askAiToRevisePlan(
  candidates: Candidate[],
  originalPlan: ScrapePlan,
  sampleRows: any[],
  revisionInstruction: string
): Promise<ScrapePlan> {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['apiKey', 'model'], async (items) => {
      const apiKey = items.apiKey;
      const model = items.model || 'gpt-4o-mini';

      if (!apiKey) return reject(new Error('Missing OpenAI API Key'));

      const prompt = `
You previously generated a JSON scrape plan for this webpage.
Here is your original scrape plan:
${JSON.stringify(originalPlan, null, 2)}

Here are the first few rows of data extracted using your plan:
${JSON.stringify(sampleRows.slice(0, 3), null, 2)}

The user has reviewed the data and provided this instruction to fix/revise it:
"${revisionInstruction}"

Below are the original DOM candidates from the page for your reference:
${JSON.stringify(candidates.slice(0, 5), null, 2)}

Please return a single, updated JSON ScrapePlan object (just the plan, NOT the full SmartCopyPlan envelope).

EXPECTED JSON SCHEMA:
{
  "candidateId": "c1",
  "itemSelector": "...",
  "fields": [
    {
      "name": "title",
      "label": "Title",
      "selector": ".title",
      "selectorScope": "item",
      "type": "text",
      "attribute": null,
      "multiple": false,
      "required": true,
      "transform": "normalize_whitespace",
      "fallbackSelectors": []
    }
  ],
  "pagination": { "strategy": "none" }
}
      `;

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
              { role: 'system', content: 'You are an expert web scraper. Return strictly valid JSON matching the requested ScrapePlan schema.' },
              { role: 'user', content: prompt }
            ],
            response_format: { type: 'json_object' }
          })
        });

        if (!response.ok) throw new Error('API Error: ' + response.statusText);

        const data = await response.json();
        const content = data.choices[0].message.content;
        console.log('Raw AI Revision Response:', content);
        
        const plan = JSON.parse(content) as ScrapePlan;
        resolve(plan);
      } catch (err) {
        reject(err);
      }
    });
  });
}
