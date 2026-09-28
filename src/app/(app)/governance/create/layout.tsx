import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Create Proposal',
  description: 'Create a public treasury withdrawal proposal for members to vote on.',
}

export default function CreateProposalLayout({ children }: { children: React.ReactNode }) {
  return children
}
