import type { Metadata } from 'next'
import { ComponentCatalogue } from './catalogue'

export const metadata: Metadata = { title: 'UI component catalogue', robots: { index: false } }

export default function ComponentCataloguePage() {
  return <ComponentCatalogue />
}
