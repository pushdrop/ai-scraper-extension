import type { Candidate, CandidateScore } from '../shared/types';

function hasAncestorMatching(el: Element, selector: string): boolean {
  return el.closest(selector) !== null;
}

export function rankCandidates(candidates: Candidate[]): Candidate[] {
  for (const candidate of candidates) {
    let score: CandidateScore = {
      total: 0,
      repeatScore: 0,
      structureScore: 0,
      contentUsefulnessScore: 0,
      mainContentScore: 0,
      antiChromePenalty: 0,
      ambiguityPenalty: 0
    };

    const firstItem = candidate.sampleElements[0];
    if (!firstItem) continue;

    // Repeat Score
    if (candidate.repeatCount >= 3 && candidate.repeatCount <= 100) {
      score.repeatScore = Math.min(1.0, candidate.repeatCount / 20); // max 1.0
    }

    // Main Content Heuristics
    const mainSelectors = ['main', '[role="main"]', 'article', '#content', '.content', '.results', '.search-results'];
    for (const selector of mainSelectors) {
      if (hasAncestorMatching(firstItem, selector)) {
        score.mainContentScore = 1.0;
        break;
      }
    }

    // Anti-Chrome Penalty
    const badSelectors = ['header', 'footer', 'nav', 'aside', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'];
    for (const selector of badSelectors) {
      if (hasAncestorMatching(firstItem, selector)) {
        score.antiChromePenalty = -1.0;
        break;
      }
    }

    // Content Usefulness (links, images, text)
    let links = 0, images = 0, textLength = 0;
    for (const el of candidate.sampleElements) {
      links += el.querySelectorAll('a').length;
      images += el.querySelectorAll('img').length;
      textLength += (el.textContent || '').trim().length;
    }
    const avgLinks = links / candidate.sampleElements.length;
    const avgImages = images / candidate.sampleElements.length;
    const avgText = textLength / candidate.sampleElements.length;

    if (avgLinks > 0) score.contentUsefulnessScore += 0.3;
    if (avgImages > 0) score.contentUsefulnessScore += 0.2;
    if (avgText > 20) score.contentUsefulnessScore += 0.5;
    
    score.total = score.repeatScore + score.structureScore + score.contentUsefulnessScore + score.mainContentScore + score.antiChromePenalty;
    
    candidate.score = score;
  }

  // Sort by highest total score
  return candidates.sort((a, b) => b.score.total - a.score.total);
}
