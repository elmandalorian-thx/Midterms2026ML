// Shape of src/data/guide.json, produced by ml/build.py

export interface TreeNode { l: number; r: number; f?: string; t?: number; n?: number; p?: number; v?: number }
export interface Named { name: string; accuracy: number }
export type Party = 'D' | 'R'

export interface ModelScore {
  key: 'logreg' | 'tree' | 'gbm'
  name: string
  accuracy: number
  trainAccuracy: number
  competitiveAccuracy: number
  logLoss: number
  brier: number
  auc: number
}

export interface District2026 {
  id: string
  state: string
  /** Cook PVI on the 2026 lines: + leans Democratic, - leans Republican */
  pvi: number
  incParty: Party | null
  incRunning: number
  newSeat: number
  hasD: number
  hasR: number
  status: string
  /** P(Democrat wins) from the forecast frozen before Election Day */
  pFrozen: number
}

export interface Guide {
  built: string
  counts: { districtYears: number; contested: number; years: number[]; train: number; val: number; test: number; candidateRows: number }
  quality: { rows: number; checked: number; agree: number; uncontested: number; openSeats: number; fusionFixed: number; disagreeBeforeFix: number; partiesOther: number }
  /** year -> [pvi, D margin, D won] for contested races */
  scatter: Record<string, [number, number, number][]>
  incumbency: { group: string; n: number; resid: number }[]
  reelect: Record<string, number>
  pviBins: { lo: number; hi: number; n: number; demWin: number }[]
  national: {
    rows: { year: number; env: number; seatsD: number; seatsR: number; seatShare: number; midterm: number; presParty: number; looLinear: number; looForest: number }[]
    linear: { intercept: number; slope: number }
    maeLinearSeats: number
    maeForestSeats: number
    midtermSwing: { year: number; swing: number; presParty: number }[]
  }
  envByYear: Record<string, number>
  baselines: Named[]
  tuning: { model: string; param: string; val: number }[]
  models: ModelScore[]
  confusion: number[][]
  roc: { fpr: number; tpr: number }[]
  inflation: { contestedOnly: number; withUncontested: number; competitiveOnly: number; competitiveN: number; safeShare: number }
  loco: { year: number; n: number; env: number; logreg: number; gbm: number; logregNoEnv: number; seatsPred: number; seatsActual: number }[]
  calibration: { bin: number; predicted: number; actual: number; n: number }[]
  splitPitfall: { random: number; temporal: number }
  depthCurve: { depth: number; unlimited: boolean; train: number; val: number }[]
  learningCurve: { n: number; logreg: number; gbm: number }[]
  effects: Record<string, number>
  ablation: Named[]
  symmetry: { logregGap: number; gbmGap: number; intercept: number; augmentedAccuracy: number; plainAccuracy: number }
  features: { key: string; label: string }[]
  sample: { year: number; district: string; pvi: number; incParty: string; incRunning: number; margin: number | null; winner: string }[]
  forecast: {
    env: number
    genericBallot: { retrieved: string; source: string; rows: { source: string; rep: number; dem: number; other: number; updated: string }[] }
    sigmaEnv: number
    sims: number
    pDemMajority: number
    medianSeatsD: number
    p10: number
    p90: number
    hist: number[]
    seatCurve: { env: number; seats: number }[]
    frozen: { frozenOn: string; env: number; sigmaEnv: number; sims: number; pDemMajority: number; medianSeatsD: number; p10: number; p90: number }
    seatChange: { heldD: number; heldR: number; newSeats: number; openSeats: number; uncontestedD: number; uncontestedR: number }
    gbmSeats: number
    lrSeats: number
  }
  score2026: null | {
    called: number; seatsD: number; seatsR: number; accuracyLogreg: number; accuracyGbm: number; brierLogreg: number
    misses: { district: string; p: number; winner: string }[]
  }
  model: {
    logreg: { mean: number[]; scale: number[]; coef: number[]; intercept: number }
    tree: TreeNode[]
    gbm: { init: number; lr: number; trees: TreeNode[][] }
  }
  districts: District2026[]
}
