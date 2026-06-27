import { fsrs, generatorParameters, createEmptyCard, Rating as FsrsRating, type Card, type FSRS, type Grade } from 'ts-fsrs'
import type { CardState, Rating } from './types'

const RATING_MAP: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
}

// ts-fsrs v5 Card has learning_steps (number) not present in CardState.
// We drop it on toCardState (state-loss for multi-step sequences is acceptable
// for this version; tracked in task-2-report). We default to 0 on toFsrsCard.
function toCardState(card: Card): CardState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  }
}

function toFsrsCard(state: CardState): Card {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: 0, // not tracked in CardState; new cards start at step 0
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.lastReview ?? undefined,
  } as Card
}

export interface SchedulerService {
  newCard(now: Date): CardState
  review(card: CardState, rating: Rating, now: Date): CardState
}

export class FsrsScheduler implements SchedulerService {
  private readonly f: FSRS
  constructor() {
    // enable_fuzz: false → deterministic scheduling (required for tests + reproducibility)
    this.f = fsrs(generatorParameters({ enable_fuzz: false }))
  }

  newCard(now: Date): CardState {
    return toCardState(createEmptyCard(now))
  }

  review(card: CardState, rating: Rating, now: Date): CardState {
    const result = this.f.next(toFsrsCard(card), now, RATING_MAP[rating])
    return toCardState(result.card)
  }
}

export const scheduler: SchedulerService = new FsrsScheduler()
