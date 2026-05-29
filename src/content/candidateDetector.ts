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
