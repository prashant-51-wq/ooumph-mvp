'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export function useWorkspace() {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const wid = localStorage.getItem('workspaceId')
    if (!wid) {
      router.push('/dashboard/onboarding')
      return
    }
    setWorkspaceId(wid)
    setReady(true)
  }, [router])

  return { workspaceId, ready }
}
