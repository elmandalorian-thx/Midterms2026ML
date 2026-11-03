import raw from '../data/guide.json'
import type { Guide } from './types'

export const guide = raw as unknown as Guide

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`
export const fmt = (x: number) => x.toLocaleString('en-US')
/** Signed lean/margin in election-night style: +5 -> "D+5", -5 -> "R+5", 0 -> "EVEN" */
export const lean = (x: number, digits = 0) =>
  Math.abs(x) < 0.05 ? 'EVEN' : `${x > 0 ? 'D' : 'R'}+${Math.abs(x).toFixed(digits)}`
export const PARTY_NAME = { D: 'Democratic', R: 'Republican' } as const
export const MAJORITY = 218
export const SEATS = 435
export const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`
