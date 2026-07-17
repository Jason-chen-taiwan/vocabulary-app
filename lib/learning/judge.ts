import { checkAnswer, type QuestionType } from './question'

// 後端權威判定的單一實作：線上 submitAnswerAction 與 /api/sync 離線重放共用。
export function judgeAnswer(
  word: { headword: string; definitionZh: string },
  questionType: QuestionType,
  userAnswer: string,
): boolean {
  return questionType === 'mc'
    ? userAnswer === word.definitionZh
    : checkAnswer(userAnswer, word.headword)
}
