import raw from '../data/guide.json'
import type { Guide } from './types'

export const guide = raw as unknown as Guide

export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`
export const fmt = (x: number) => x.toLocaleString('en-US')
/** Signed lean/margin in election-night style: +5 -> "D+5", -5 -> "R+5", 0 -> "EVEN" */
export const lean = (x: number, digits = 0) =>
  Math.abs(x) < 0.05 ? 'EVEN' : `${x > 0 ? 'D' : 'R'}+${Math.abs(x).toFixed(digits)}`
/** ISO time -> 'Nov 4, 2:41 PM ET' */
export const etTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET'
/** One-direction summary of forecast misses, worded the same for either party. */
export const missWords = (toD: number, toR: number) =>
  toD + toR === 0 ? 'no contested race went against the forecast'
    : toR === 0 ? `all ${toD} went to Democrats in races the forecast gave to Republicans`
    : toD === 0 ? `all ${toR} went to Republicans in races the forecast gave to Democrats`
    : `${toD} went to Democrats and ${toR} to Republicans`
export const PARTY_NAME = { D: 'Democratic', R: 'Republican' } as const
export const MAJORITY = 218
export const SEATS = 435
export const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`
