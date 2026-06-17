import { getScanRoots } from './domScanner';
import { detectCandidates, dedupeCandidates } from './candidateDetector';
import { rankCandidates } from './candidateRanker';
import { executeScrapePlan } from './scrapeExecutor';
import { highlightElements, clearHighlights } from './overlayHighlighter';

console.log('DataPluck content script loaded');

function getSampleRows(sampleElements: Element[]) {
  return sampleElements.map(el => (el.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 100));
}

function getCommonChildren(sampleElements: Element[]) {
  if (sampleElements.length === 0) return [];
  const first = sampleElements[0];
  const children = Array.from(first.querySelectorAll('*'));
  
  const common = [];
  for (const child of children) {
    if (!child.tagName) continue;
    let selector = child.tagName.toLowerCase();
    if (child.classList.length > 0) {
      selector += '.' + Array.from(child.classList).map(c => CSS.escape(c)).join('.');
    }
    
    let textSamples: string[] = [];
    let hrefSamples: string[] = [];
    let srcSamples: string[] = [];
    
    for (const sample of sampleElements) {
      try {
        const match = sample.querySelector(selector);
        if (match) {
          if (match.textContent && match.textContent.trim()) textSamples.push(match.textContent.trim().substring(0, 50));
          if (match.tagName === 'A' && (match as HTMLAnchorElement).href) hrefSamples.push((match as HTMLAnchorElement).href);
          if (match.tagName === 'IMG' && (match as HTMLImageElement).src) srcSamples.push((match as HTMLImageElement).src);
        }
      } catch (e) {
        // ignore invalid selector errors
      }
    }
    
    if (textSamples.length > 0 || hrefSamples.length > 0 || srcSamples.length > 0) {
      common.push({
        relativeSelector: selector,
        tag: child.tagName.toLowerCase(),
        textSamples: Array.from(new Set(textSamples)).slice(0, 2),
        hrefSamples: Array.from(new Set(hrefSamples)).slice(0, 2),
        srcSamples: Array.from(new Set(srcSamples)).slice(0, 2)
      });
    }
  }
  
  const uniqueCommon = [];
  const seenSelectors = new Set();
  for (const c of common) {
    if (!seenSelectors.has(c.relativeSelector)) {
      seenSelectors.add(c.relativeSelector);
      uniqueCommon.push(c);
    }
  }
  return uniqueCommon.slice(0, 15);
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'SCAN_PAGE') {
    const roots = getScanRoots();
    let candidates = detectCandidates(roots);
    candidates = rankCandidates(candidates);
    // Collapse nested duplicates of the same region so distinct patterns survive truncation.
    candidates = dedupeCandidates(candidates);
    
    // We send candidates up to the popup
    const serializableCandidates = candidates.map(c => ({
      candidateId: c.candidateId,
      itemSelector: c.itemSelector,
      containerSelector: c.containerSelector,
      repeatCount: c.repeatCount,
      score: c.score,
      sampleRows: getSampleRows(c.sampleElements),
      commonChildren: getCommonChildren(c.sampleElements)
    }));

    sendResponse({ candidates: serializableCandidates });
    return true; // async response
  }

  if (request.action === 'EXECUTE_SCRAPE') {
    const plan = request.plan;
    if (!plan) {
      sendResponse({ error: 'No plan provided' });
      return true;
    }
    try {
      const rows = executeScrapePlan(plan);
      sendResponse({ rows });
    } catch (e: any) {
      sendResponse({ error: e.message });
    }
    return true;
  }

  if (request.action === 'GET_SELECTION') {
    const sel = window.getSelection()?.toString() || '';
    sendResponse({ selection: sel.replace(/\s+/g, ' ').trim() });
    return true;
  }

  if (request.action === 'HIGHLIGHT_CANDIDATE') {
    if (request.selector) highlightElements(request.selector);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'CLEAR_HIGHLIGHTS') {
    clearHighlights();
    sendResponse({ success: true });
    return true;
  }
});
