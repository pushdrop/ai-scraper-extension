import type { Candidate } from '../shared/types';
import { isValidContentElement } from './domScanner';

function computeStructuralSimilarity(el1: Element, el2: Element): number {
  if (el1.tagName !== el2.tagName) return 0;
  
  let score = 0.5;
  
  const class1 = Array.from(el1.classList);
  const class2 = Array.from(el2.classList);
  
  const commonClasses = class1.filter(c => class2.includes(c));
  if (class1.length > 0 || class2.length > 0) {
    const classSimilarity = (commonClasses.length * 2) / (class1.length + class2.length);
    score += classSimilarity * 0.5;
  } else {
    score += 0.5;
  }
  
  return score;
}

function generateSelector(el: Element): string {
  let selector = el.tagName.toLowerCase();
  if (el.id) {
    try {
      CSS.escape(el.id);
      return `#${CSS.escape(el.id)}`;
    } catch(e) {}
  }
  if (el.classList.length > 0) {
    selector += '.' + Array.from(el.classList).map(c => CSS.escape(c)).join('.');
  }
  return selector;
}

export function detectCandidates(roots: Element[]): Candidate[] {
  const candidates: Candidate[] = [];
  let candidateIdCounter = 1;

  for (const root of roots) {
    const children = Array.from(root.children);
    const groups: Element[][] = [];
    
    for (const child of children) {
      if (!isValidContentElement(child)) continue;

      let matched = false;
      for (const group of groups) {
        if (computeStructuralSimilarity(group[0], child) >= 0.7) {
          group.push(child);
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        groups.push([child]);
      }
    }

    for (const group of groups) {
      if (group.length >= 3) {
        candidates.push({
          candidateId: `c${candidateIdCounter++}`,
          containerSelector: generateSelector(root),
          itemSelector: generateSelector(group[0]),
          repeatCount: group.length,
          score: {
             total: 0, repeatScore: 0, structureScore: 0, contentUsefulnessScore: 0,
             mainContentScore: 0, antiChromePenalty: 0, ambiguityPenalty: 0
          },
          sampleElements: group.slice(0, 3)
        });
      }
    }
  }

  return candidates;
}

/**
 * Collapses candidates that point at the SAME underlying data region but were
 * detected at different DOM nesting levels (e.g. a wrapper <section> and the
 * inner grid both directly containing the same repeated cards). Without this,
 * the top of the ranked list fills up with near-duplicate variants of the one
 * dominant region and genuinely DISTINCT patterns never reach the model.
 *
 * Expects candidates pre-sorted by score (best first) so the higher-scored
 * variant of a region is the one kept.
 */
export function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const kept: Candidate[] = [];
  for (const cand of candidates) {
    const candEl = cand.sampleElements[0];
    if (!candEl) continue;
    const isRedundant = kept.some((k) => {
      const kEl = k.sampleElements[0];
      if (!kEl) return false;
      // Same region if one sample item contains the other (nested wrappers of
      // the same repeated data).
      return kEl.contains(candEl) || candEl.contains(kEl);
    });
    if (!isRedundant) kept.push(cand);
  }
  return kept;
}
