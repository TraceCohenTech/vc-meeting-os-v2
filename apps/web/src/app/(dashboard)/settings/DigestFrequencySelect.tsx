'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

interface DigestFrequencySelectProps {
  currentValue: string
  userId: string
}

const frequencies = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

export function DigestFrequencySelect({ currentValue, userId }: DigestFrequencySelectProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [value, setValue] = useState(currentValue)

  const handleChange = async (newValue: string) => {
    setValue(newValue)
    setIsLoading(true)

    try {
      const supabase = createClient()
      // @ts-expect-error - Supabase types
      await supabase.from('profiles').update({ digest_frequency: newValue }).eq('id', userId)

      router.refresh()
    } catch (error) {
      console.error('Error updating digest frequency:', error)
      setValue(currentValue) // Revert on error
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isLoading}
        className="w-full max-w-xs px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 appearance-none cursor-pointer"
      >
        {frequencies.map((freq) => (
          <option key={freq.value} value={freq.value}>
            {freq.label}
          </option>
        ))}
      </select>
      {isLoading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
        </div>
      )}
    </div>
  )
}
