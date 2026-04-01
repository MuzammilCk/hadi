export interface QualificationResult {
  isActive: boolean;
  isQualified: boolean;
  currentRankLevel: number | null;
  /** rule_key values of unmet mandatory rules */
  failedRules: string[];
  policyVersionId: string;
  evaluatedAt: Date;
}
