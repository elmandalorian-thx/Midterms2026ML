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
    // Findings at the close of the count (ml/build.py): contested races only unless noted
    closedAt: string; uncalled: number; majority: 'D' | 'R' | null; contested: number; missToD: number; missToR: number
    dataIssues: string[]; closeN: number; closeAccuracy: number | null; contestedAccuracy: number; contestedBrier: number
    impliedEnv: number; impliedLo: number; impliedHi: number; frozenEnv: number; hindsightAccuracy: number; hindsightBrier: number
  }
  model: {
    logreg: { mean: number[]; scale: number[]; coef: number[]; intercept: number }
    tree: TreeNode[]
    gbm: { init: number; lr: number; trees: TreeNode[][] }
  }
  districts: District2026[]
}

/* ---------------------------------------------------------------- Senate: src/data/senate.json (ml/build_senate.py) */

export type Side = 'D' | 'R'
export interface LogRegParams { mean: number[]; scale: number[]; coef: number[]; intercept: number }

export interface SenateRace2026 {
  /** "TX", or "OH-S" for a special election */
  id: string
  state: string
  special: number
  /** State lean computed from presidential results (+ Democratic, - Republican), in Cook PVI points */
  lean: number
  cook: number | null
  incParty: 'D' | 'R' | 'I' | null
  /** Side the incumbent belongs to (an independent incumbent counts for the side they stand in for) */
  incSide: Side | null
  incRunning: number
  /** Democratic-side candidate; "(I)" marks an independent standing in where Democrats have no nominee */
  dName: string | null
  rName: string | null
  dStandin: number
  hasD: number
  hasR: number
  status: string
  /** P(Democratic side wins), frozen before Election Day */
  pFrozen: number
  /** P(this race delivers the seat that decides control) */
  pTipping: number
  winSide: Side | 'X' | null
  winnerName: string | null
}

export interface SenateMethod {
  key: string; name: string; probabilistic: boolean; accuracy: number; competitiveAccuracy: number; brier?: number; logLoss?: number
}

export interface SenateForecast {
  env: number; sigmaEnv: number; sims: number; model: string; modelName: string
  pRControl: number; pDControl: number; pNoMajority: number
  medianSeatsR: number; p10R: number; p90R: number; medianSeatsD: number; meanIndependents: number
  hold: { R: number; D: number; I_caucusD: number }
  before: { R: number; D: number; I_caucusD: number }
  needR: number; needD: number; vpParty: string
  /** keys: House winner + Senate outcome (D, R, N = no majority without independents), e.g. "DR" */
  joint: Record<string, number>
  jointIfIndependent: Record<string, number>
  houseD: number
}

export interface Senate {
  built: string
  counts: { races: number; contested: number; years: number[]; houseRows: number; perYear: Record<string, number> }
  quality: {
    races: number; contested: number; checked: number; agree: number; noOpponent: number; thirdCandidateWon: number; marginMissing: number
    standIns: { year: number; race: string; name: string; side: Side; won: boolean }[]
    cookCheck: { n: number; corr: number; mae: number; rows: [string, number, number][] }
  }
  /** year -> [lean, D-side margin, D side won] */
  scatter: Record<string, [number, number, number][]>
  drift: { year: number; n: number; corr: number; slope: number; residSd: number; env: number }[]
  straightTicket: { year: number; n: number; same: number; share: number }[]
  outliers: { year: number; race: string; dName: string; rName: string; dStandin: boolean; margin: number; expected: number; resid: number; winner: Side }[]
  incumbency: { group: string; n: number; resid: number }[]
  envByYear: Record<string, number>
  loco: ({ year: number; n: number; env: number; ciLo: number; ciHi: number; brierSenate: number; brierHouse: number; seatsPred: number; seatsActual: number } & Record<string, number>)[]
  summary: SenateMethod[]
  chosen: string
  calibration: Record<string, { bin: number; predicted: number; actual: number; n: number }[]>
  learning: { n: number; brier: number }[]
  houseBrier: number
  effects: Record<string, Record<string, number>>
  symmetry: { logregGap: number; gbmGap: number }
  features: { key: string; label: string }[]
  forecast: SenateForecast & {
    frozen: SenateForecast & { frozenOn: string; rule: string }
    hist: number[]
    ctrlCurve: { env: number; pR: number; pD: number; seatsR: number }[]
    byEnv: { label: string; share: number; pHouseD: number; pSenateR: number; pSenateD: number }[]
    genericBallot: Guide['forecast']['genericBallot']
    houseEnvSlope: number
  }
  score2026: null | {
    called: number; dSide: number; rSide: number; accuracy: number; brier: number; misses: { race: string; p: number; winner: string }[]
    closedAt: string; uncalled: string[]; seats: { R: number; D: number; I: number }; control: 'D' | 'R' | null; contested: number
    missToD: number; missToR: number; closeN: number; closeAccuracy: number | null
    impliedEnv: number; impliedLo: number; impliedHi: number; frozenEnv: number | null; hindsightAccuracy: number; hindsightBrier: number
  }
  model: { logreg: Record<string, LogRegParams>; gbm: Guide['model']['gbm']; tree: TreeNode[] }
  races: SenateRace2026[]
}

/** Kalshi / Polymarket snapshot taken before polls closed (ml/fetch_markets.py). p = P(Democratic side). */
export interface MarketQuote { p: number; vol: number; spread: number | null; liquid: boolean; id: string }
export type MarketKey = 'kalshi' | 'polymarket'
export type MarketQuotes = Partial<Record<MarketKey, MarketQuote>>
export interface Markets {
  fetchedAt: string
  cutoff: string
  rules: { minVolume: number; maxSpread: number }
  sources: { key: MarketKey; name: string; url: string }[]
  control: { house: MarketQuotes; senate: MarketQuotes }
  house: Record<string, MarketQuotes>
  senate: Record<string, MarketQuotes>
}
