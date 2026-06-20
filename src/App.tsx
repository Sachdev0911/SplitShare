import React, { useState, useEffect, createContext, useContext } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from "react-router-dom";
import { auth, db, setDoc, getDoc, doc, googleProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, onSnapshot } from "./firebase";
import { User } from "./types";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Plus, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";

import Dashboard from "./pages/Dashboard";
import GroupDetails from "./pages/GroupDetails";
import ProfileModal from "./components/ProfileModal";
import ChatDrawer from "./components/ChatDrawer";

// --- Contexts ---
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  user: null,
  loading: true,
  signIn: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// --- Components ---
const Navbar = () => {
  const { user, logout } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">S</div>
            <span className="font-bold text-xl tracking-tight text-gray-900">SplitShare</span>
          </Link>
          {user && (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium text-gray-900">{user.name}</span>
                <div className="flex gap-3 mt-0.5">
                  <button onClick={() => setIsProfileOpen(true)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors">Profile</button>
                  <button onClick={logout} className="text-xs text-gray-500 hover:text-red-500 transition-colors">Sign Out</button>
                </div>
              </div>
              <button onClick={() => setIsProfileOpen(true)} className="focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-full">
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.name}`} className="w-9 h-9 rounded-full border border-gray-200 object-cover" alt="Profile" />
              </button>
            </div>
          )}
        </div>
      </nav>
      {user && (
        <ProfileModal 
          isOpen={isProfileOpen} 
          onClose={() => setIsProfileOpen(false)} 
          user={user} 
        />
      )}
    </>
  );
};

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-500 font-medium">Loading your balances...</p>
    </div>
  </div>
);

const LoginPage = () => {
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsSigningIn(true);
    try {
      await signIn();
    } catch (err: any) {
      console.error("Sign in error:", err);
      if (err.code === "auth/popup-blocked") {
        setError("Popup blocked. Please allow popups for this site.");
      } else if (err.code === "auth/popup-closed-by-user") {
        setError("Sign-in popup was closed before completion. Please try again.");
      } else if (err.code === "auth/unauthorized-domain") {
        setError("⚠️ ACTION REQUIRED: This domain is NOT authorized in your Firebase Console. Go to Authentication > Settings > Authorized domains and add: 'ais-dev-nik2r6so3ycjhuoevcpjmu-736644251830.asia-southeast1.run.app' and 'ais-pre-nik2r6so3ycjhuoevcpjmu-736644251830.asia-southeast1.run.app'");
      } else if (err.code === "auth/account-exists-with-different-credential") {
        setError("An account already exists with the same email address but different sign-in credentials. Try signing in using your email and password.");
      } else {
        setError(err.message || "An error occurred during sign in.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSigningIn(true);
    try {
      if (isSignUp) {
        const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(firebaseUser, { displayName: name });
        const newUser: User = {
          id: firebaseUser.uid,
          name: name,
          email: email,
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, "users", firebaseUser.uid), newUser);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Email auth error:", err);
      if (err.code === "auth/operation-not-allowed") {
        setError("⚠️ ACTION REQUIRED: Email/Password login is NOT enabled in your Firebase Console. Go to Authentication > Sign-in method and enable 'Email/Password' to fix this.");
      } else if (err.code === "auth/email-already-in-use") {
        setError("This email is already in use. Try logging in instead.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please use at least 6 characters.");
      } else if (err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        setError("Invalid email or password.");
      } else {
        setError(err.message || "An error occurred during authentication.");
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-xl p-6 sm:p-8 border border-gray-100"
      >
        <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6 shadow-lg shadow-emerald-200">S</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">{isSignUp ? "Join Now" : "Welcome Back"}</h1>
        <p className="text-gray-500 mb-8 text-center text-sm">{isSignUp ? "Create an account to start splitting expenses." : "Log in to manage your shared bills."}</p>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-medium border border-red-100">
            <div className="flex items-start gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-bold mb-1">ACTION REQUIRED:</p>
                <p>{error}</p>
                {error.includes("Email/Password login is NOT enabled") && (
                  <div className="mt-2 p-2 bg-white rounded-lg border border-red-200 text-[10px] text-gray-600 leading-relaxed">
                    <p className="font-bold text-red-700">How to fix this:</p>
                    <ol className="list-decimal ml-4 mt-1 space-y-1">
                      <li>Open <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">Firebase Console</a></li>
                      <li>Go to <strong>Authentication</strong> &gt; <strong>Sign-in method</strong></li>
                      <li>Click <strong>Add new provider</strong> &gt; <strong>Email/Password</strong></li>
                      <li><strong>Enable</strong> it and click <strong>Save</strong></li>
                    </ol>
                  </div>
                )}
                {error.includes("email is already in use") && (
                  <button 
                    onClick={() => {
                      setIsSignUp(false);
                      setError(null);
                    }}
                    className="mt-2 w-full bg-white border border-red-200 text-red-700 py-2 rounded-xl text-[10px] font-bold hover:bg-red-50 transition-all"
                  >
                    Switch to Login
                  </button>
                )}
                {error.includes("domain is NOT authorized") && (
                  <div className="mt-2 p-2 bg-white rounded-lg border border-red-200 text-[10px] text-gray-600 leading-relaxed">
                    <p className="font-bold text-red-700">How to fix this:</p>
                    <ol className="list-decimal ml-4 mt-1 space-y-1">
                      <li>Open <a href="https://console.firebase.google.com/" target="_blank" className="underline text-blue-600">Firebase Console</a></li>
                      <li>Go to <strong>Authentication</strong> &gt; <strong>Settings</strong> &gt; <strong>Authorized domains</strong></li>
                      <li>Click <strong>Add domain</strong></li>
                      <li>Paste: <code className="bg-gray-100 px-1">ais-dev-nik2r6so3ycjhuoevcpjmu-736644251830.asia-southeast1.run.app</code></li>
                      <li>Click <strong>Add</strong> again for: <code className="bg-gray-100 px-1">ais-pre-nik2r6so3ycjhuoevcpjmu-736644251830.asia-southeast1.run.app</code></li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
          {isSignUp && (
            <input 
              type="text" 
              placeholder="Your Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          )}
          <input 
            type="email" 
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button 
            type="submit"
            disabled={isSigningIn}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl py-3 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50"
          >
            {isSigningIn ? "Processing..." : (isSignUp ? "Join Now" : "Log In")}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-gray-400">Or continue with</span></div>
        </div>

        <button 
          onClick={handleGoogleSignIn}
          disabled={isSigningIn}
          className="w-full bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-xl py-3 flex items-center justify-center gap-2 transition-all disabled:opacity-50 mb-6"
        >
          <img src="https://www.gstatic.com/firebase/anonymous/google.svg" alt="Google" className="w-5 h-5" />
          Google
        </button>

        <p className="text-center text-sm text-gray-500">
          {isSignUp ? "Already have an account?" : "New here?"}{" "}
          <button 
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-emerald-600 font-semibold hover:underline"
          >
            {isSignUp ? "Log In" : "Join Now"}
          </button>
        </p>
      </motion.div>
    </div>
  );
};

// --- Main App ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubAuth = auth.onAuthStateChanged(async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userRef = doc(db, "users", firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (!userDoc.exists()) {
            const newUser: User = {
              id: firebaseUser.uid,
              name: firebaseUser.displayName || "Anonymous",
              email: firebaseUser.email || "",
              createdAt: new Date().toISOString(),
            };
            if (firebaseUser.photoURL) {
              newUser.photoURL = firebaseUser.photoURL;
            }
            await setDoc(userRef, newUser);
            setUser(newUser);
          } else {
            setUser(userDoc.data() as User);
          }

          unsubUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              setUser(docSnap.data() as User);
            }
          });
        } else {
          if (unsubUser) {
            unsubUser();
            unsubUser = null;
          }
          setUser(null);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUser) unsubUser();
    };
  }, []);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  if (loading) return <LoadingScreen />;

  return (
    <AuthContext.Provider value={{ user, loading, signIn, logout }}>
      <ErrorBoundary>
        <Router>
          <div className="min-h-screen bg-gray-50 font-sans text-gray-900 selection:bg-emerald-100">
            {user ? (
              <>
                <Navbar />
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/group/:id" element={<GroupDetails />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
                <ChatDrawer />
              </>
            ) : (
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="*" element={<Navigate to="/login" />} />
              </Routes>
            )}
          </div>
        </Router>
      </ErrorBoundary>
    </AuthContext.Provider>
  );
}
