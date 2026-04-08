// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

export interface ProfileSeedDef {
  slug: string
  name: string
  description: string
  modelTier: 'cheap' | 'strong'
  builtIn: true
}

export const BUILT_IN_PROFILE_DEFS: ProfileSeedDef[] = [
  {
    slug: 'default',
    name: 'Default',
    description: 'Generic base profile. Blank slate — no specialization. Starting point for user customization.',
    modelTier: 'cheap',
    builtIn: true,
  },
  {
    slug: 'personal-assistant',
    name: 'Personal Assistant',
    description: 'Scheduling, tasks, email, and day-to-day help.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'planner',
    name: 'Planner',
    description: 'Project planning, task breakdown, timelines, and roadmaps.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'coach',
    name: 'Coach',
    description: 'Goal-setting, reflection, feedback, and personal development.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'researcher',
    name: 'Researcher',
    description: 'Deep research, synthesis, citations, and fact-checking.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'analyst',
    name: 'Analyst',
    description: 'Data analysis, pattern recognition, reporting, and insights.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'summarizer',
    name: 'Summarizer',
    description: 'Condensing content, briefings, and abstracts.',
    modelTier: 'cheap',
    builtIn: true,
  },
  {
    slug: 'writer',
    name: 'Writer',
    description: 'Long-form writing, drafting, storytelling, and editing.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'copywriter',
    name: 'Copywriter',
    description: 'Marketing copy, ads, product descriptions, and campaigns.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'editor',
    name: 'Editor',
    description: 'Critique, review, and improvement suggestions.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'developer',
    name: 'Developer',
    description: 'Coding, debugging, architecture, and code review.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'devops',
    name: 'DevOps',
    description: 'Infrastructure, deployment, monitoring, and scripting.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'tester',
    name: 'Tester',
    description: 'QA, test writing, and edge case analysis.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'executive',
    name: 'Executive',
    description: 'Strategic thinking, high-level decisions, and stakeholder communication.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'operations',
    name: 'Operations',
    description: 'Process optimization, SOPs, and workflows.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'sales',
    name: 'Sales',
    description: 'Outreach, pitches, CRM, and follow-ups.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'creative',
    name: 'Creative',
    description: 'Brainstorming, ideation, and design thinking.',
    modelTier: 'strong',
    builtIn: true,
  },
  {
    slug: 'designer',
    name: 'Designer',
    description: 'UI/UX, visual concepts, and brand thinking.',
    modelTier: 'strong',
    builtIn: true,
  },
]
