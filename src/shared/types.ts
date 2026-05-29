export type CandidateScore = {
  total: number;
  repeatScore: number;
  structureScore: number;
  contentUsefulnessScore: number;
  mainContentScore: number;
  antiChromePenalty: number;
  ambiguityPenalty: number;
};

export type Candidate = {
  candidateId: string;
  itemSelector: string;
  containerSelector: string;
  repeatCount: number;
  score: CandidateScore;
  sampleElements: Element[];
};

export type RepeatedGroup = {
  itemElement: Element;
  parent: Element;
  siblings: Element[];
};

export type DetectionDecision =
  | { mode: 'auto'; candidate: Candidate }
  | { mode: 'choose'; candidates: Candidate[] }
  | { mode: 'click_example' };
