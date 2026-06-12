import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export interface ScheduledReport {
  id: string
  type: 'daily' | 'weekly' | 'monthly'
  delivery: 'telegram' | 'email' | 'both'
  cronExpression: string
  nextRunAt: string | null
  lastRunAt: string | null
}

export function useReports() {
  const [reports, setReports] = useState<ScheduledReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ reports: ScheduledReport[] }>('/reports')
      setReports(data.reports)
    } catch {
      // Silently ignore load errors — user may not have reports yet
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const deleteReport = async (id: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await apiFetch(`/reports/${id}`, { method: 'DELETE' })
      setReports(prev => prev.filter(r => r.id !== id))
    } catch (err: any) {
      setError(err.message ?? 'Gagal menghapus laporan.')
    } finally {
      setLoading(false)
    }
  }

  return { reports, loading, error, deleteReport }
}
