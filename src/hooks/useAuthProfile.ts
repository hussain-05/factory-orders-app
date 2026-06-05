import { useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { db } from '../lib/firebase'
import { saveUserProfile } from '../lib/userService'
import { useAuth } from '../contexts/AuthContext'
import { updateOrdersForUser } from '../lib/orderUpdater'

export function useAuthProfile() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(false)

  const updateProfileDetails = async (displayName: string, whatsappNumber: string) => {
    if (!user || !profile || !db) throw new Error('Not authenticated')
    setLoading(true)
    try {
      await saveUserProfile(db, {
        ...profile,
        displayName,
        whatsappNumber,
      })
      await updateOrdersForUser(db, user.uid, displayName, whatsappNumber)
    } finally {
      setLoading(false)
    }
  }

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user) throw new Error('Not authenticated')
    setLoading(true)
    try {
      const lastSignInTime = new Date(user.metadata.lastSignInTime || 0).getTime()
      const now = new Date().getTime()
      const fiveMinutes = 5 * 60 * 1000

      if (now - lastSignInTime > fiveMinutes) {
        if (!user.email) throw new Error('User email not found')
        const credential = EmailAuthProvider.credential(user.email, currentPassword)
        await reauthenticateWithCredential(user, credential)
      }

      await updatePassword(user, newPassword)
    } finally {
      setLoading(false)
    }
  }

  return {
    updateProfileDetails,
    changePassword,
    loading,
  }
}
