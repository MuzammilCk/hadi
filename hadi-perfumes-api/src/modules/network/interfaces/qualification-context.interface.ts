export interface QualificationContext {
  /** Sum of personal retail sales in window_days */
  personalVolume: number;
  /** Sum of downline retail sales in window_days */
  downlineVolume: number;
  /** Count of direct recruits who are themselves active */
  activeLegCount: number;
}
