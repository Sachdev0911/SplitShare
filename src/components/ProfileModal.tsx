import React, { useState } from "react";
import { User } from "../types";
import { auth, db, doc, updateDoc, updateProfile, updatePassword, OperationType, handleFirestoreError, signOut } from "../firebase";
import { motion, AnimatePresence } from "framer-motion";
import { X, Camera, Save, Lock, LogOut } from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
}

export default function ProfileModal({ isOpen, onClose, user }: ProfileModalProps) {
  const [name, setName] = useState(user.name);
  const [photoURL, setPhotoURL] = useState(user.photoURL || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSaving(true);

    try {
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name,
          photoURL: photoURL || null,
        });
      }

      await updateDoc(doc(db, "users", user.id), {
        name,
        photoURL: photoURL || null,
      });

      setSuccess(true);
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setError(err.message || "Failed to update profile");
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters long");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setPasswordSuccess(true);
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          setPasswordSuccess(false);
        }, 3000);
      } else {
        setPasswordError("You must be logged in to update your password");
      }
    } catch (err: any) {
      console.error("Error updating password:", err);
      if (err.code === 'auth/requires-recent-login') {
        setPasswordError("Please sign out and sign back in to update your password.");
      } else {
        setPasswordError(err.message || "Failed to update password");
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onClose();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 backdrop-blur-md">
        <div className="min-h-full flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl p-6 sm:p-8 max-w-sm w-full border border-gray-100 relative my-8"
          >
            <button
              onClick={onClose}
              className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full transition-colors z-10"
            >
              <X size={20} />
            </button>

          <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-6">Your Profile</h2>

          <form onSubmit={handleSave} className="space-y-5">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <img
                  src={photoURL || `https://ui-avatars.com/api/?name=${name}`}
                  alt="Profile"
                  className="w-24 h-24 rounded-full border-4 border-white shadow-lg object-cover"
                />
                <div className="absolute bottom-0 right-0 bg-emerald-500 text-white p-2 rounded-full shadow-md border-2 border-white">
                  <Camera size={14} />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium border border-red-100">
                {error}
              </div>
            )}
            
            {success && (
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-medium border border-emerald-100">
                Profile updated successfully!
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Photo URL (Optional)</label>
              <input
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl py-3 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
            >
              <Save size={18} />
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Update Password</h3>
            
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              {passwordError && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium border border-red-100">
                  {passwordError}
                </div>
              )}
              
              {passwordSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-medium border border-emerald-100">
                  Password updated successfully!
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isUpdatingPassword || !newPassword || !confirmPassword}
                className="w-full bg-gray-900 hover:bg-black text-white font-semibold rounded-xl py-3 shadow-lg shadow-gray-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                <Lock size={18} />
                {isUpdatingPassword ? "Updating..." : "Update Password"}
              </button>
            </form>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-100 sm:hidden">
            <button
              onClick={handleSignOut}
              className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl py-3 transition-all flex items-center justify-center gap-2"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
