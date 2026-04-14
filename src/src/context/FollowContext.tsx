import React, { createContext, useContext, useState } from 'react'

interface FollowContextType {
  isFollowing: (userId: string) => boolean
  isPending: (userId: string) => boolean
  toggleFollow: (userId: string, currentlyFollowing: boolean) => Promise<void>
  updateCounter: number
}

const FollowContext = createContext<FollowContextType | undefined>(undefined)

export const FollowProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set())
  const [pendingUsers, setPendingUsers] = useState<Set<string>>(new Set())
  const [updateCounter, setUpdateCounter] = useState(0)

  const isFollowing = (userId: string) => followingUsers.has(userId)
  const isPending = (userId: string) => pendingUsers.has(userId)

  const toggleFollow = async (userId: string, currentlyFollowing: boolean) => {
    if (currentlyFollowing) {
      setFollowingUsers(prev => {
        const newSet = new Set(prev)
        newSet.delete(userId)
        return newSet
      })
    } else {
      setPendingUsers(prev => new Set(prev).add(userId))
      setTimeout(() => {
        setPendingUsers(prev => {
          const newSet = new Set(prev)
          newSet.delete(userId)
          return newSet
        })
        setFollowingUsers(prev => new Set(prev).add(userId))
        setUpdateCounter(c => c + 1)
      }, 500)
    }
  }

  return (
    <FollowContext.Provider value={{ isFollowing, isPending, toggleFollow, updateCounter }}>
      {children}
    </FollowContext.Provider>
  )
}

export const useFollow = () => {
  const context = useContext(FollowContext)
  if (!context) {
    throw new Error('useFollow must be used within FollowProvider')
  }
  return context
}
