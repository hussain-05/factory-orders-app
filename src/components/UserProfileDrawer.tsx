import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, LogOut, User, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAuthProfile } from '../hooks/useAuthProfile'
import { Button } from './ui/Button'

type UserProfileDrawerProps = {
 isOpen: boolean
 onClose: () => void
}

export function UserProfileDrawer({ isOpen, onClose }: UserProfileDrawerProps) {
 const { profile, logout } = useAuth()
 const { changePassword, loading } = useAuthProfile()
 const navigate = useNavigate()

 // Editable Profile fields
 const [displayName, setDisplayName] = useState(profile?.displayName || '')
 const [whatsappNumber, setWhatsappNumber] = useState(profile?.whatsappNumber || '')

 // Password fields
 const [currentPassword, setCurrentPassword] = useState('')
 const [newPassword, setNewPassword] = useState('')
 const [confirmPassword, setConfirmPassword] = useState('')
 const [isEditingPassword, setIsEditingPassword] = useState(false)

 // Password strength validation
 const isPasswordStrong = (pwd: string) => {
 if (!pwd) return false
 const hasMinLength = pwd.length >= 8
 const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
 const hasCapitalLetter = /[A-Z]/.test(pwd)
 return hasMinLength && hasSpecialChar && hasCapitalLetter
 }

 // Local notification state for the drawer since useNotifications toast might be hidden or generic
 const [localMessage, setLocalMessage] = useState<{ type: 'error' | 'success', text: string, action?: { label: string, onClick: () => void } } | null>(null)

 // Sync profile data when drawer opens or profile changes
 useEffect(() => {
 if (isOpen) {
 setDisplayName(profile?.displayName || '')
 setWhatsappNumber(profile?.whatsappNumber || '')
 setLocalMessage(null)
 setIsEditingPassword(false)
 setCurrentPassword('')
 setNewPassword('')
 setConfirmPassword('')
 }
 }, [isOpen, profile])

 const handleSavePassword = async () => {
 if (newPassword !== confirmPassword) {
 setLocalMessage({ type: 'error', text: 'Passwords do not match' })
 return
 }
 try {
 setLocalMessage(null)
 await changePassword(currentPassword, newPassword)
 setIsEditingPassword(false)
 setCurrentPassword('')
 setNewPassword('')
 setConfirmPassword('')
 setLocalMessage({ type: 'success', text: 'Password updated successfully' })
 setTimeout(() => setLocalMessage(null), 3000)
 } catch (err: any) {
 // Common errors
 if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
 setLocalMessage({ type: 'error', text: 'Incorrect current password' })
 } else if (err.code === 'auth/weak-password') {
 setLocalMessage({ type: 'error', text: 'Password is too weak' })
 } else if (err.code === 'auth/requires-recent-login') {
 setLocalMessage({
  type: 'error',
  text: 'For security reasons, you must log in recently to change your password.',
  action: { label: 'Sign out now', onClick: handleLogout }
 })
 } else {
 setLocalMessage({ type: 'error', text: err.message || 'Failed to update password' })
 }
 }
 }

 const handleLogout = async () => {
 onClose()
 await logout()
 navigate('/login')
 }

 return (
 <AnimatePresence>
 {isOpen && (
 <>
 {/* Backdrop */}
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={onClose}
 className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm"
 />

 {/* Drawer */}
 <motion.div
 initial={{ x: '100%' }}
 animate={{ x: 0 }}
 exit={{ x: '100%' }}
 transition={{ type: 'spring', damping: 25, stiffness: 200 }}
 className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl sm:max-w-md"
 >
 {/* Header */}
 <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 ">
 <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 ">
 <User className="h-5 w-5 text-emerald-600 " />
 User Profile
 </h2>
 <button
 onClick={onClose}
 className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
 >
 <X className="h-5 w-5" />
 </button>
 </div>

 {/* Body */}
 <div className="flex-1 overflow-y-auto px-6 py-6">
 {localMessage && (
 <div className={`mb-6 rounded-lg px-4 py-3 text-sm flex flex-col gap-1 ${localMessage.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
 <span>{localMessage.text}</span>
 {localMessage.action && (
  <button onClick={localMessage.action.onClick} className="self-start mt-1 font-semibold underline hover:text-red-700">
    {localMessage.action.label}
  </button>
 )}
 </div>
 )}

 {/* Profile Details */}
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-medium text-slate-500 ">Personal Information</h3>
 </div>

 <div className="space-y-3">
 <div>
 <label className="mb-1 block text-sm font-medium text-slate-700 ">Name</label>
 <input
 type="text"
 disabled
 value={displayName}

 className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
 />
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-slate-700 ">Phone Number (WhatsApp)</label>
 <input
 type="text"
 disabled
 value={whatsappNumber}

 className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
 />
 </div>

 </div>
 </div>

 <div className="my-8 h-px bg-slate-100 " />

 {/* Password Section */}
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <h3 className="text-sm font-medium text-slate-500 ">Security</h3>
 {!isEditingPassword && (
 <button onClick={() => setIsEditingPassword(true)} className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
 Change Password
 </button>
 )}
 </div>

 {isEditingPassword && (
 <div className="space-y-3">
 <div>
 <label className="mb-1 block text-sm font-medium text-slate-700 ">Current Password</label>
 <input
 type="password"
 value={currentPassword}
 onChange={e => setCurrentPassword(e.target.value)}
 className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 "
 />
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-slate-700 ">New Password</label>
 <input
 type="password"
 value={newPassword}
 onChange={e => setNewPassword(e.target.value)}
 className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 "
 />
 {newPassword && (
 <p className={`mt-1 text-xs ${isPasswordStrong(newPassword) ? 'text-emerald-600' : 'text-amber-600'}`}>
 {isPasswordStrong(newPassword) ? '✓ Strong password' : 'Password must be at least 8 characters, contain 1 special character and 1 capital letter.'}
 </p>
 )}
 </div>
 <div>
 <label className="mb-1 block text-sm font-medium text-slate-700 ">Confirm New Password</label>
 <input
 type="password"
 value={confirmPassword}
 onChange={e => setConfirmPassword(e.target.value)}
 className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 "
 />
 </div>
 <div className="flex justify-end gap-2 pt-2">
 <Button variant="secondary" onClick={() => setIsEditingPassword(false)} disabled={loading}>
 Cancel
 </Button>
 <Button onClick={handleSavePassword} disabled={loading || !currentPassword || !newPassword || !confirmPassword || !isPasswordStrong(newPassword)}>
 {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
 Update Password
 </Button>
 </div>
 </div>
 )}
 </div>

 </div>

 {/* Footer */}
 <div className="border-t border-slate-100 bg-slate-50 p-6 ">
 <Button
 variant="secondary"
 className="w-full justify-center text-rose-600 hover:bg-rose-50 hover:text-rose-700"
 onClick={handleLogout}
 >
 <LogOut className="mr-2 h-4 w-4" />
 Sign Out
 </Button>
 </div>
 </motion.div>
 </>
 )}
 </AnimatePresence>
 )
}
