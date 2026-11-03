// Animation primitives. Everything respects prefers-reduced-motion (values jump to the end state).
import { useEffect, useRef, useState, type ReactNode } from 'react'

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(margin = '-10% 0px') {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (!ref.current || inView) return
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true) }, { rootMargin: margin })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [inView, margin])
  return [ref, inView] as const
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3)

/** Smoothly animates toward `target` whenever it changes. */
export function useTween(target: number, ms = 700, start?: number) {
  const [value, setValue] = useState(start ?? target)
  const from = useRef(start ?? target)
  const cur = useRef(value)
  cur.current = value
  useEffect(() => {
    if (reducedMotion()) { setValue(target); return }
    from.current = cur.current
    const t0 = performance.now()
    let raf = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      setValue(from.current + (target - from.current) * ease(k))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

/** A number that counts up from 0 the first time it scrolls into view. */
export function CountUp({ value, format, ms = 1100 }: { value: number; format: (v: number) => string; ms?: number }) {
  const [ref, inView] = useInView<HTMLSpanElement>()
  const v = useTween(inView ? value : 0, ms, 0)
  return <span ref={ref} className="tabular">{format(inView ? v : 0)}</span>
}

/** Fades + lifts its children in when scrolled into view. */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return <div ref={ref} className={`fade ${inView ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>
}
