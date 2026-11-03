import { GuideShell } from './components/SiteNav'
import { Data } from './sections/Data'
import { Evaluate } from './sections/Evaluate'
import { Explore } from './sections/Explore'
import { Features } from './sections/Features'
import { Forecast } from './sections/Forecast'
import { Hero, Problem } from './sections/Intro'
import { Baselines, Models } from './sections/Models'
import { Scorecard } from './sections/Scorecard'
import { Wrap } from './sections/Wrap'

const LINKS = [
  { label: 'Notebook', href: 'https://github.com/elmandalorian-thx/Midterms2026ML/blob/main/notebooks/midterms_2026_ml.ipynb' },
  { label: 'Code & data', href: 'https://github.com/elmandalorian-thx/Midterms2026ML' },
]

const CHAPTERS = [
  ['problem', 'Frame the problem'], ['data', 'Meet the data'], ['explore', 'Explore'], ['features', 'Features'],
  ['baselines', 'Baselines'], ['models', 'Models'], ['evaluate', 'Evaluate honestly'], ['forecast', '2026 forecast'],
  ['scorecard', 'Score it'], ['wrap', 'Limits & files'],
] as const

export default function App() {
  return (
    <GuideShell current="house" chapters={CHAPTERS} links={LINKS}>
      <Hero />
      <Problem />
      <Data />
      <Explore />
      <Features />
      <Baselines />
      <Models />
      <Evaluate />
      <Forecast />
      <Scorecard />
      <Wrap />
    </GuideShell>
  )
}
