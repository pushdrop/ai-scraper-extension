import type { ScrapePlan, ScrapeField } from '../shared/modelClient';

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function extractValue(elements: Element[], field: ScrapeField): unknown {
  const values = elements.map(el => {
    if (field.type === 'text') {
      const text = (el as HTMLElement).innerText || el.textContent || '';
      return field.transform === 'normalize_whitespace' ? normalizeWhitespace(text) : text.trim();
    }
    if (field.type === 'html') {
      return (el as HTMLElement).innerHTML;
    }
    if (field.type === 'attribute' && field.attribute) {
      return el.getAttribute(field.attribute);
    }
    if (field.type === 'absolute_url') {
      const raw = field.attribute ? el.getAttribute(field.attribute) : (el as HTMLAnchorElement).href;
      try {
        return raw ? new URL(raw, location.href).href : null;
      } catch (e) {
        return raw;
      }
    }
    return null;
  }).filter(v => v != null && v !== '');

  return field.multiple ? values : values[0] ?? null;
}

export function executeScrapePlan(plan: ScrapePlan) {
  const items = Array.from(document.querySelectorAll(plan.itemSelector));

  const rows = items.map((item) => {
    const row: Record<string, unknown> = {};

    for (const field of plan.fields) {
      const scope = field.selectorScope === 'document' ? document : item;
      let elements = Array.from(scope.querySelectorAll(field.selector));
      
      if (elements.length === 0 && field.fallbackSelectors) {
         for (const fb of field.fallbackSelectors) {
             elements = Array.from(scope.querySelectorAll(fb));
             if (elements.length > 0) break;
         }
      }

      const selected = field.multiple ? elements : elements.slice(0, 1);

      let value = extractValue(selected, field);
      row[field.name] = value;
    }

    return row;
  });

  // Filter out rows where all fields are null or empty
  const validRows = rows.filter(row => {
    return Object.values(row).some(val => {
      if (Array.isArray(val)) return val.length > 0;
      return val !== null && val !== '';
    });
  });

  return validRows;
}
