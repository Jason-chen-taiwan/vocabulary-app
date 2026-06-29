'use client'
import { useState } from 'react'
import type { Board } from '@/lib/leaderboard/service'

function Rows({ board, unit }: { board: Board; unit: string }) {
  if (board.entries.length === 0) return <p className="py-8 text-center text-neutral-600">還沒有人上榜，快去複習衝榜！</p>
  return (
    <ul className="space-y-2">
      {board.entries.map((e) => (
        <li key={e.rank}
          className={`flex items-center justify-between rounded-control px-4 py-3 ${e.isMe ? 'bg-primary-100 font-extrabold text-primary-700' : 'bg-surface text-neutral-900'}`}>
          <span className="flex items-center gap-3"><span className="w-6 text-right text-neutral-600">#{e.rank}</span>{e.name}{e.isMe && '（你）'}</span>
          <span className="font-bold">{e.value} {unit}</span>
        </li>
      ))}
      {board.myRank !== null && !board.entries.some((e) => e.isMe) && (
        <li className="mt-3 rounded-control bg-primary-100 px-4 py-3 text-center font-bold text-primary-700">你的排名 #{board.myRank}</li>
      )}
    </ul>
  )
}

export function LeaderboardTabs({ weekly, allTime }: { weekly: Board; allTime: Board }) {
  const [tab, setTab] = useState<'weekly' | 'allTime'>('weekly')
  return (
    <>
      <div className="mb-4 flex gap-2">
        {(['weekly', 'allTime'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-control py-2 font-bold transition ${tab === t ? 'bg-primary-500 text-white' : 'bg-primary-50 text-primary-600'}`}>
            {t === 'weekly' ? '本週' : '總榜'}
          </button>
        ))}
      </div>
      {tab === 'weekly' ? <Rows board={weekly} unit="XP" /> : <Rows board={allTime} unit="XP" />}
    </>
  )
}
