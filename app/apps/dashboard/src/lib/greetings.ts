// Copyright (c) 2026 Sinthetix, LLC. All rights reserved.
// https://www.sinthetix.com

const GREETINGS: Record<string, string[]> = {
  morning_weekday: [
    "Good morning, {name}. Ready to build something?",
    "Morning, {name}. What's on the agenda today?",
    "Good morning, {name} — coffee's brewing, let's get started.",
    "Morning, {name}. What are we tackling first?",
    "Good morning. What are we making happen today?",
    "Morning. Fresh start — where do you want to begin?",
    "Rise and grind. What's first on the list, {name}?",
    "Morning, {name}. The day's wide open.",
    "Good morning — I've been waiting. What are we doing?",
    "A new day, {name}. Let's make it count.",
    "Morning, {name}. Pick up where we left off, or something new?",
    "Good morning. What's the most important thing on your plate today?",
  ],
  morning_monday: [
    "Happy Monday, {name}. Big week ahead?",
    "New week, {name}. What are we kicking off?",
    "Monday morning, {name}. Set the tone — what's first?",
    "It's Monday, {name}. What does a good week look like from here?",
    "Week one, day one. What are we building, {name}?",
    "Happy Monday. Fresh slate — what's the plan?",
  ],
  morning_friday: [
    "Happy Friday, {name} — almost there.",
    "Friday morning, {name}. Let's make it count.",
    "Last push of the week, {name}. What needs to get done?",
    "Friday, {name}. Finish strong — what's left?",
    "Almost the weekend, {name}. What are we closing out?",
    "Friday morning — the finish line is right there, {name}.",
  ],
  morning_weekend: [
    "Good morning, {name}. Working on the weekend — respect.",
    "Morning, {name}. What are you building today?",
    "Weekend warrior mode, {name}. What's the project?",
    "Saturday morning and you're already here, {name}. I like it.",
    "Sunday morning, {name}. Quiet hours are the best hours.",
    "Weekend mornings hit different. What are we doing, {name}?",
    "No days off, {name}. What are we getting into?",
  ],
  afternoon_weekday: [
    "Good afternoon, {name}. How's the day going?",
    "Hey {name}, afternoon check-in — what do you need?",
    "Afternoon, {name}. What can I help you with?",
    "Good afternoon, {name}. What's next?",
    "Midday, {name}. Keeping the momentum going?",
    "Afternoon. The hard part of the day is usually behind you — what's left?",
    "Hey {name}. Afternoon slump or afternoon surge?",
    "Good afternoon. What are we making progress on?",
    "Afternoon, {name}. What's blocking you? Let's unblock it.",
    "Hey {name} — post-lunch lull, or full steam ahead?",
  ],
  afternoon_friday: [
    "Friday afternoon, {name}. Wrapping up or pushing through?",
    "Almost the weekend, {name} — what's left on the list?",
    "Friday afternoon. The clock is ticking, {name} — what needs to ship?",
    "Last few hours of the week, {name}. Make them count.",
    "TGIF, {name}. One last push — what are we finishing?",
  ],
  afternoon_weekend: [
    "Good afternoon, {name}. Weekend project mode?",
    "Afternoon, {name}. What are you working on?",
    "Weekend afternoon, {name}. Side project? Deep work? I'm here.",
    "Afternoon. No meetings, no interruptions — just you and me, {name}.",
    "Saturday afternoon and you're building something. Respect, {name}.",
  ],
  evening_weekday: [
    "Good evening, {name}. Burning the midnight oil?",
    "Evening, {name}. What are we finishing up?",
    "Hey {name}, working late — what do you need?",
    "Good evening, {name}. What's still on your mind?",
    "Evening, {name}. The office emptied out — good time to get things done.",
    "Late in the day, {name}. What didn't make it onto the earlier list?",
    "Evening. The quiet hours are starting — what are we tackling?",
    "Hey {name} — long day? Let's knock something out.",
    "Evening, {name}. Prime focus time. What's the goal tonight?",
    "Good evening. What do you want to have done before you call it a night, {name}?",
  ],
  evening_friday: [
    "Friday evening, {name} — big plans or big projects?",
    "Friday night, {name}. Wrapping up the week or starting something new?",
    "End of the week, {name}. You made it. What's on your mind?",
    "Friday evening. The week's behind you — what's ahead?",
  ],
  evening_weekend: [
    "Evening, {name}. Weekend wind-down or late sprint?",
    "Sunday evening, {name}. Prepping for the week or decompressing?",
    "Weekend evening, {name}. Still going — what are we working on?",
    "Evening. Late-weekend energy hits different. What are we doing, {name}?",
  ],
  night: [
    "Late night, {name}. What are we working on?",
    "Still up, {name}? What do you need?",
    "Night owl mode, {name}. I'm here.",
    "It's late, {name} — what's on your mind?",
    "The quiet hours. Just you, me, and whatever we're building, {name}.",
    "You're up late, {name}. Must be important — let's get to it.",
    "Burning the midnight oil again, {name}? I respect it.",
    "Late night deep work session. What are we solving?",
    "It's late, {name}. Insomnia or inspiration?",
    "Night mode. The best ideas come late — what've you got?",
    "The rest of the world is asleep, {name}. We've got the place to ourselves.",
    "Up past midnight, {name}. I'll be here as long as you are.",
    "Somewhere it's morning. Here it's just us, late at night.",
    "Dark outside, brain still running — what are we working on, {name}?",
  ],
}

const STATIC_CHIPS = [
  "What should I focus on next?",
  "Give me a status update",
  "What did we work on last time?",
  "Help me think through something",
  "What's blocked right now?",
]

export function selectGreeting(name: string): string {
  const now = new Date()
  const hour = now.getHours()
  const day = now.getDay() // 0=Sun, 1=Mon, 5=Fri, 6=Sat
  const isWeekend = day === 0 || day === 6
  const isMonday = day === 1
  const isFriday = day === 5

  let bucket: string
  if (hour >= 22 || hour < 5) {
    bucket = 'night'
  } else if (hour < 12) {
    bucket = isMonday ? 'morning_monday'
      : isFriday ? 'morning_friday'
      : isWeekend ? 'morning_weekend'
      : 'morning_weekday'
  } else if (hour < 18) {
    bucket = isFriday ? 'afternoon_friday'
      : isWeekend ? 'afternoon_weekend'
      : 'afternoon_weekday'
  } else {
    bucket = isFriday ? 'evening_friday'
      : isWeekend ? 'evening_weekend'
      : 'evening_weekday'
  }

  const pool = GREETINGS[bucket] ?? GREETINGS['morning_weekday']!
  const template = pool[Math.floor(Math.random() * pool.length)]!
  return template.replace(/{name}/g, name || 'there')
}

export { STATIC_CHIPS }
