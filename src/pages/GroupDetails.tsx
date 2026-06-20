import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, onSnapshot, doc, collection, query, where, addDoc, updateDoc, getDocs, Timestamp, OperationType, handleFirestoreError, arrayUnion, deleteDoc } from "../firebase";
import { useAuth } from "../App";
import { Expense, Group, User, Payment } from "../types";
import { formatCurrency, calculateNetBalances, settleDebts, cn } from "../utils";
import { ArrowLeft, Plus, Receipt, Wallet, Users, ChevronRight, History, CircleCheck, CircleAlert, Settings, Trash2, UserPlus, X, CreditCard, MessageCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { GoogleGenAI } from "@google/genai";
import PrivateChatModal from "../components/PrivateChatModal";

export default function GroupDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [members, setMembers] = useState<Record<string, User>>({});
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiInput, setAiInput] = useState("");

  // Form state
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(user?.id || "");
  const [splitType, setSplitType] = useState<'equal' | 'exact' | 'percentage'>('equal');
  const [customSplits, setCustomSplits] = useState<Record<string, string>>({});

  // Settle Up state
  const [settleUpData, setSettleUpData] = useState<{toUserId: string, maxAmount: number} | null>(null);
  const [settleUpAmount, setSettleUpAmount] = useState<string>("");

  // Chat state
  const [chatTargetUser, setChatTargetUser] = useState<User | null>(null);

  // Member management state
  const [memberEmail, setMemberEmail] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberEmail.trim() || !id || !user || !group) return;
    setIsAddingMember(true);
    setMemberError(null);
    try {
      const q = query(collection(db, "users"), where("email", "==", memberEmail.trim()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setMemberError("User not found. Ask them to sign in to SplitShare first!");
        return;
      }
      const newUser = snap.docs[0].data();
      if (group.members.includes(newUser.id)) {
        setMemberError("User is already in the group.");
        return;
      }

      // Check if there's already a pending invitation
      const invQ = query(
        collection(db, "invitations"), 
        where("inviterId", "==", user.id),
        where("inviteeId", "==", newUser.id)
      );
      const invSnap = await getDocs(invQ);
      const hasPending = invSnap.docs.some(doc => {
        const data = doc.data();
        return data.groupId === id && data.status === "pending";
      });
      
      if (hasPending) {
        setMemberError("Invitation already sent to this user.");
        return;
      }

      await addDoc(collection(db, "invitations"), {
        groupId: id,
        groupName: group.name,
        inviterId: user.id,
        inviterName: user.name,
        inviteeEmail: newUser.email,
        inviteeId: newUser.id,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      
      setMemberEmail("");
      setMemberError("Invitation sent successfully!");
      setTimeout(() => setMemberError(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "invitations");
    } finally {
      setIsAddingMember(false);
    }
  };

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteGroup = async () => {
    if (!id || !group) return;
    setIsDeleting(true);
    try {
      // 1. Delete all expenses
      const expensesSnap = await getDocs(collection(db, "groups", id, "expenses"));
      const expenseDeletes = expensesSnap.docs.map(doc => deleteDoc(doc.ref));
      
      // 2. Delete all payments
      const paymentsSnap = await getDocs(collection(db, "groups", id, "payments"));
      const paymentDeletes = paymentsSnap.docs.map(doc => deleteDoc(doc.ref));
      
      // Execute all subcollection deletes
      await Promise.all([...expenseDeletes, ...paymentDeletes]);
      
      // 3. Delete the group document
      await deleteDoc(doc(db, "groups", id));
      
      navigate("/");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApproveExpense = async (expenseId: string, currentApprovals: string[]) => {
    if (!id || !user || currentApprovals.includes(user.id)) return;
    
    const newApprovals = [...currentApprovals, user.id];
    const isFullyApproved = newApprovals.length === group?.members.length;
    
    try {
      await updateDoc(doc(db, "groups", id, "expenses", expenseId), {
        approvals: arrayUnion(user.id),
        status: isFullyApproved ? 'approved' : 'pending'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${id}/expenses/${expenseId}`);
    }
  };

  const handleDeclineExpense = async (expenseId: string) => {
    if (!id || !user) return;
    try {
      await updateDoc(doc(db, "groups", id, "expenses", expenseId), {
        status: 'declined'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${id}/expenses/${expenseId}`);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!id || !user) return;
    try {
      await deleteDoc(doc(db, "groups", id, "expenses", expenseId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${id}/expenses/${expenseId}`);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!id || !user || !group) return;
    if (memberId === user.id) {
      setMemberError("You cannot remove yourself. Use 'Delete Group' if you want to remove everyone.");
      setTimeout(() => setMemberError(null), 5000);
      return;
    }
    try {
      const newMembers = group.members.filter(mId => mId !== memberId);
      await updateDoc(doc(db, "groups", id), {
        members: newMembers
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${id}`);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!id || !user) return;
    try {
      await deleteDoc(doc(db, "groups", id, "payments", paymentId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${id}/payments/${paymentId}`);
    }
  };

  const handleSettleUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user || !settleUpData || !settleUpAmount) return;
    
    const amount = parseFloat(settleUpAmount);
    if (isNaN(amount) || amount <= 0) return;

    try {
      await addDoc(collection(db, "groups", id, "payments"), {
        fromUser: user.id,
        toUser: settleUpData.toUserId,
        amount,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      setSettleUpData(null);
      setSettleUpAmount("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `groups/${id}/payments`);
    }
  };

  const handleConfirmPayment = async (paymentId: string) => {
    if (!id || !user) return;
    try {
      await updateDoc(doc(db, "groups", id, "payments", paymentId), {
        status: 'completed'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `groups/${id}/payments/${paymentId}`);
    }
  };

  const handleAiParse = async () => {
    if (!aiInput.trim()) return;
    setIsAiParsing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract expense details from this text: "${aiInput}". Return JSON with "description" and "amount" (number). If not found, return null.`,
        config: { responseMimeType: "application/json" }
      });
      
      const data = JSON.parse(response.text || "{}");
      if (data.description) setDescription(data.description);
      if (data.amount) setAmount(data.amount.toString());
      setAiInput("");
    } catch (error) {
      console.error("AI Parse error:", error);
    } finally {
      setIsAiParsing(false);
    }
  };

  useEffect(() => {
    if (!id || !user) return;

    // Fetch group
    const unsubGroup = onSnapshot(doc(db, "groups", id), (docSnap) => {
      if (docSnap.exists()) {
        const groupData = { id: docSnap.id, ...docSnap.data() } as Group;
        setGroup(groupData);
        
        // Fetch members details
        groupData.members.forEach(async (memberId) => {
          const mSnap = await getDocs(query(collection(db, "users"), where("id", "==", memberId)));
          if (!mSnap.empty) {
            setMembers(prev => ({ ...prev, [memberId]: mSnap.docs[0].data() as User }));
          }
        });
      } else {
        navigate("/");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `groups/${id}`);
    });

    // Fetch expenses
    const unsubExpenses = onSnapshot(collection(db, "groups", id, "expenses"), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `groups/${id}/expenses`);
    });

    // Fetch payments
    const unsubPayments = onSnapshot(collection(db, "groups", id, "payments"), (snapshot) => {
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `groups/${id}/payments`);
    });

    return () => {
      unsubGroup();
      unsubExpenses();
      unsubPayments();
    };
  }, [id, user, navigate]);

  const balances = useMemo(() => {
    if (!group) return {};
    return calculateNetBalances(expenses, payments, group.members);
  }, [expenses, payments, group]);

  const transactions = useMemo(() => {
    return settleDebts(balances);
  }, [balances]);

  const [expenseError, setExpenseError] = useState<string | null>(null);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseError(null);
    if (!id || !user || !description || !amount || !group) return;

    const totalAmount = parseFloat(amount);
    const splits: Record<string, number> = {};

    if (splitType === 'equal') {
      const splitAmount = totalAmount / group.members.length;
      group.members.forEach(mId => splits[mId] = splitAmount);
    } else if (splitType === 'exact') {
      let sum = 0;
      group.members.forEach(mId => {
        const val = parseFloat(customSplits[mId] || "0");
        splits[mId] = val;
        sum += val;
      });
      if (Math.abs(sum - totalAmount) > 0.01) {
        setExpenseError(`Total splits ($${sum.toFixed(2)}) must equal total amount ($${totalAmount.toFixed(2)})`);
        return;
      }
    } else if (splitType === 'percentage') {
      let sum = 0;
      group.members.forEach(mId => {
        const pct = parseFloat(customSplits[mId] || "0");
        splits[mId] = (pct / 100) * totalAmount;
        sum += pct;
      });
      if (Math.abs(sum - 100) > 0.01) {
        setExpenseError(`Total percentages (${sum}%) must equal 100%`);
        return;
      }
    }

    try {
      await addDoc(collection(db, "groups", id, "expenses"), {
        description,
        totalAmount,
        currency: "USD",
        paidById: paidBy,
        groupId: id,
        splitType,
        splits,
        status: 'pending',
        approvals: [user.id], // Creator automatically approves
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `groups/${id}/expenses`);
    }

    setDescription("");
    setAmount("");
    setCustomSplits({});
    setShowAddExpense(false);
  };

  if (loading || !group) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Dashboard
        </button>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all",
            showSettings ? "bg-gray-900 text-white" : "bg-white text-gray-600 border border-gray-100 hover:bg-gray-50"
          )}
        >
          <Settings size={18} />
          {showSettings ? "Close Settings" : "Group Settings"}
        </button>
      </div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-8"
          >
            <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <UserPlus size={18} className="text-emerald-500" />
                    Manage Members
                  </h3>
                  <form onSubmit={handleAddMember} className="flex gap-2 mb-4">
                    <input 
                      type="email"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      placeholder="Friend's email"
                      className="flex-1 bg-gray-50 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <button 
                      type="submit"
                      disabled={isAddingMember || !memberEmail}
                      className="bg-gray-900 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-50 transition-all"
                    >
                      {isAddingMember ? "..." : "Add"}
                    </button>
                  </form>
                  {memberError && <p className="text-xs text-red-500 mb-4 font-medium">{memberError}</p>}
                  <div className="space-y-2">
                    {group.members.map(mId => (
                      <div key={mId} className="flex items-center justify-between p-2 bg-gray-50 rounded-xl group/member">
                        <div className="flex items-center gap-2">
                          <img src={members[mId]?.photoURL || `https://ui-avatars.com/api/?name=${members[mId]?.name}`} className="w-6 h-6 rounded-full" alt="" />
                          <span className="text-sm font-medium text-gray-700">{members[mId]?.name || "..."}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {mId !== user.id && (
                            <>
                              <button 
                                onClick={() => setChatTargetUser(members[mId])}
                                className="opacity-0 group-hover/member:opacity-100 text-emerald-500 hover:text-emerald-700 transition-all p-1"
                                title="Message"
                              >
                                <MessageCircle size={14} />
                              </button>
                              <button 
                                onClick={() => handleRemoveMember(mId)}
                                className="opacity-0 group-hover/member:opacity-100 text-red-500 hover:text-red-700 transition-all p-1"
                                title="Remove Member"
                              >
                                <X size={14} />
                              </button>
                              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Member</span>
                            </>
                          )}
                          {mId === user.id && (
                            <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">You</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Trash2 size={18} className="text-red-500" />
                      Danger Zone
                    </h3>
                    <p className="text-sm text-gray-500 mb-6">Once you delete a group, there is no going back. Please be certain.</p>
                  </div>
                  {!showDeleteConfirm ? (
                    <button 
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full bg-red-50 text-red-600 rounded-2xl py-4 font-bold hover:bg-red-100 transition-all border border-red-100"
                    >
                      Delete Group
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button 
                        onClick={handleDeleteGroup}
                        disabled={isDeleting}
                        className="flex-1 bg-red-600 text-white rounded-2xl py-4 font-bold hover:bg-red-700 transition-all disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeleting}
                        className="flex-1 bg-gray-100 text-gray-600 rounded-2xl py-4 font-bold hover:bg-gray-200 transition-all disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Left Column: Group Info & Expenses */}
        <div className="flex-1">
          <header className="mb-8">
            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-2">{group.name}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Users size={14} /> {group.members.length} members</span>
              <span className="flex items-center gap-1"><Receipt size={14} /> {expenses.length} expenses</span>
            </div>
          </header>

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Expenses</h2>
            <button 
              onClick={() => setShowAddExpense(true)}
              className="flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Add Expense</span>
            </button>
          </div>

          <div className="space-y-4">
            {expenses.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                <Receipt className="mx-auto text-gray-300 mb-3" size={40} />
                <p className="text-gray-500">No expenses yet. Add one to get started!</p>
              </div>
            ) : (
              expenses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((expense) => (
                <motion.div 
                  layout
                  key={expense.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white p-5 rounded-3xl border border-gray-100 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start sm:items-center justify-between mb-4 gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 shrink-0">
                        <Receipt size={24} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-gray-900 truncate">{expense.description}</h4>
                        <p className="text-xs text-gray-500 truncate mb-1">
                          Paid by <span className="font-medium text-gray-700">{members[expense.paidById]?.name || "..."}</span>
                        </p>
                        <p className="text-[10px] text-gray-400 font-medium">
                          {new Date(expense.createdAt).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', year: 'numeric',
                            hour: 'numeric', minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end shrink-0">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-1"
                          title="Delete Expense"
                        >
                          <Trash2 size={14} />
                        </button>
                        <div className="font-bold text-gray-900">{formatCurrency(expense.totalAmount, expense.currency)}</div>
                      </div>
                      <div className="flex items-center gap-2 justify-end mt-1">
                        {expense.status === 'approved' ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                            <CircleCheck size={12} /> Approved
                          </span>
                        ) : expense.status === 'declined' ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 uppercase tracking-wider">
                            <X size={12} /> Declined
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                            <History size={12} /> Pending ({expense.approvals.length}/{group.members.length})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {expense.status === 'pending' && !expense.approvals.includes(user.id) && (
                    <div className="flex gap-2 mt-4 pt-4 border-t border-gray-50">
                      <button 
                        onClick={() => handleApproveExpense(expense.id, expense.approvals)}
                        className="flex-1 bg-emerald-50 text-emerald-600 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all"
                      >
                        Agree
                      </button>
                      <button 
                        onClick={() => handleDeclineExpense(expense.id)}
                        className="flex-1 bg-red-50 text-red-600 py-2 rounded-xl text-xs font-bold hover:bg-red-100 transition-all"
                      >
                        Decline
                      </button>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-gray-50 flex flex-wrap gap-2">
                    {Object.entries(expense.splits).map(([mId, amount]) => (
                      <div key={mId} className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
                        <span className="text-[10px] font-medium text-gray-500 truncate max-w-[60px]">{members[mId]?.name || "..."}:</span>
                        <span className="text-[10px] font-bold text-gray-700">{formatCurrency(amount as number)}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Balances & Settlement */}
        <div className="w-full md:w-80 space-y-6">
          <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Wallet size={18} className="text-emerald-500" />
              Balances
            </h3>
            <p className="text-[10px] text-gray-400 font-medium mb-4 uppercase tracking-wider">Only approved expenses</p>
            <div className="space-y-4">
              {Object.entries(balances).map(([userId, amount]) => (
                <div key={userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={members[userId]?.photoURL || `https://ui-avatars.com/api/?name=${members[userId]?.name}`} className="w-6 h-6 rounded-full" alt="" />
                    <span className="text-sm font-medium text-gray-700">{members[userId]?.name || "..."}</span>
                  </div>
                  <span className={cn(
                    "text-sm font-bold",
                    (amount as number) > 0 ? "text-emerald-500" : (amount as number) < 0 ? "text-red-500" : "text-gray-400"
                  )}>
                    {(amount as number) > 0 ? "+" : ""}{formatCurrency(amount as number)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-gray-900 text-white p-6 rounded-3xl shadow-xl shadow-gray-200">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <History size={18} className="text-emerald-400" />
              Settlements
            </h3>
            {transactions.length === 0 ? (
              <div className="flex flex-col items-center py-4 text-gray-400">
                <CircleCheck size={32} className="mb-2 text-emerald-400" />
                <p className="text-xs font-medium">Everyone is settled up!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {transactions.map((t, idx) => (
                  <div key={idx} className="bg-white/10 p-3 rounded-2xl border border-white/5">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="text-xs text-gray-400 font-medium truncate min-w-0">{members[t.from]?.name} owes</span>
                      <span className="text-xs text-emerald-400 font-bold shrink-0">{formatCurrency(t.amount)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-gray-400 shrink-0">to</span>
                        <span className="text-xs font-bold truncate min-w-0">{members[t.to]?.name}</span>
                      </div>
                      {t.from === user.id && (
                        <button 
                          onClick={() => {
                            setSettleUpData({ toUserId: t.to, maxAmount: t.amount });
                            setSettleUpAmount(t.amount.toString());
                          }}
                          className="bg-emerald-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold hover:bg-emerald-600 transition-all shrink-0"
                        >
                          Settle Up
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recent Payments Section */}
          <section className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard size={18} className="text-emerald-500" />
              Recent Payments
            </h3>
            <div className="space-y-4">
              {payments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No payments recorded yet.</p>
              ) : (
                payments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(p => (
                  <div key={p.id} className="p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <img src={members[p.fromUser]?.photoURL || `https://ui-avatars.com/api/?name=${members[p.fromUser]?.name}`} className="w-5 h-5 rounded-full shrink-0" alt="" />
                        <span className="text-[10px] font-bold text-gray-900 truncate min-w-0">{members[p.fromUser]?.name}</span>
                        <ChevronRight size={10} className="text-gray-400 shrink-0" />
                        <img src={members[p.toUser]?.photoURL || `https://ui-avatars.com/api/?name=${members[p.toUser]?.name}`} className="w-5 h-5 rounded-full shrink-0" alt="" />
                        <span className="text-[10px] font-bold text-gray-900 truncate min-w-0">{members[p.toUser]?.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-black text-gray-900">{formatCurrency(p.amount)}</span>
                        <button 
                          onClick={() => handleDeletePayment(p.id)}
                          className="text-gray-300 hover:text-red-500 transition-all"
                          title="Delete Payment"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400 font-medium">
                        {new Date(p.createdAt).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit'
                        })}
                      </span>
                      {p.status === 'completed' ? (
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1">
                          <CircleCheck size={10} /> Cleared
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1">
                            <History size={10} /> Pending
                          </span>
                          {p.toUser === user.id && (
                            <button 
                              onClick={() => handleConfirmPayment(p.id)}
                              className="bg-emerald-500 text-white px-2 py-1 rounded-md text-[10px] font-bold hover:bg-emerald-600 transition-all"
                            >
                              Confirm
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showAddExpense && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 backdrop-blur-md">
          <div className="min-h-full flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-6 sm:p-8 max-w-md w-full border border-gray-100 my-8"
            >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Add Expense</h2>
              <button onClick={() => setShowAddExpense(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>

            <div className="mb-8 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">AI Quick Add</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="e.g. Lunch for $25"
                  className="flex-1 bg-white border-0 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button 
                  onClick={handleAiParse}
                  disabled={isAiParsing}
                  className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-50 transition-all"
                >
                  {isAiParsing ? "..." : "Parse"}
                </button>
              </div>
            </div>
            
            <form onSubmit={handleAddExpense} className="space-y-6">
              {expenseError && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium border border-red-100">
                  {expenseError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Description</label>
                <input 
                  autoFocus
                  type="text" 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Dinner, Groceries, etc."
                  className="w-full bg-gray-50 border-0 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-medium"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                    <input 
                      type="number" 
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-gray-50 border-0 rounded-2xl pl-10 pr-5 py-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-bold text-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Paid By</label>
                  <select 
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="w-full bg-gray-50 border-0 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none font-medium appearance-none"
                  >
                    {group.members.map(mId => (
                      <option key={mId} value={mId}>{members[mId]?.name || "..."}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Split Type</label>
                <div className="flex gap-2 p-1 bg-gray-50 rounded-2xl">
                  {(['equal', 'exact', 'percentage'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setSplitType(type)}
                      className={cn(
                        "flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all",
                        splitType === type ? "bg-white text-emerald-500 shadow-sm" : "text-gray-400 hover:text-gray-600"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {splitType !== 'equal' && (
                <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {group.members.map(mId => (
                    <div key={mId} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <img src={members[mId]?.photoURL || `https://ui-avatars.com/api/?name=${members[mId]?.name}`} className="w-6 h-6 rounded-full" alt="" />
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[100px]">{members[mId]?.name || "..."}</span>
                      </div>
                      <div className="relative flex-1 max-w-[120px]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[10px] font-bold">
                          {splitType === 'exact' ? '$' : '%'}
                        </span>
                        <input 
                          type="number"
                          step="0.01"
                          value={customSplits[mId] || ""}
                          onChange={(e) => setCustomSplits(prev => ({ ...prev, [mId]: e.target.value }))}
                          placeholder="0.00"
                          className="w-full bg-gray-50 border-0 rounded-xl pl-6 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-emerald-50 p-4 rounded-2xl flex items-start gap-3">
                <CircleAlert className="text-emerald-500 shrink-0" size={18} />
                <p className="text-xs text-emerald-700 leading-relaxed font-medium">
                  {splitType === 'equal' 
                    ? `This expense will be split equally among all ${group.members.length} members.`
                    : splitType === 'exact' 
                      ? "Enter the exact amount each person owes. Total must match expense amount."
                      : "Enter the percentage each person owes. Total must equal 100%."
                  }
                </p>
              </div>

              <button 
                type="submit"
                disabled={!description || !amount}
                className="w-full bg-emerald-500 text-white rounded-2xl py-5 font-bold text-lg hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-100 disabled:opacity-50 disabled:shadow-none active:scale-[0.98]"
              >
                Save Expense
              </button>
            </form>
          </motion.div>
          </div>
        </div>
      )}

      {/* Settle Up Modal */}
      {settleUpData && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 backdrop-blur-md">
          <div className="min-h-full flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-6 sm:p-8 max-w-sm w-full border border-gray-100 my-8"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Settle Up</h2>
                <button onClick={() => setSettleUpData(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="mb-6 flex items-center justify-center gap-4">
                <div className="flex flex-col items-center">
                  <img src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.name}`} className="w-12 h-12 rounded-full mb-2" alt="" />
                  <span className="text-xs font-bold text-gray-900">You</span>
                </div>
                <ChevronRight className="text-gray-300" size={24} />
                <div className="flex flex-col items-center">
                  <img src={members[settleUpData.toUserId]?.photoURL || `https://ui-avatars.com/api/?name=${members[settleUpData.toUserId]?.name}`} className="w-12 h-12 rounded-full mb-2" alt="" />
                  <span className="text-xs font-bold text-gray-900">{members[settleUpData.toUserId]?.name}</span>
                </div>
              </div>

              <form onSubmit={handleSettleUp}>
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Amount to Settle</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                    <input 
                      autoFocus
                      type="number" 
                      step="0.01"
                      min="0.01"
                      max={settleUpData.maxAmount}
                      value={settleUpAmount}
                      onChange={(e) => setSettleUpAmount(e.target.value)}
                      className="w-full bg-gray-50 border-0 rounded-2xl pl-8 pr-4 py-4 text-xl font-black text-gray-900 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Total owed: <span className="font-bold text-gray-900">{formatCurrency(settleUpData.maxAmount)}</span>
                  </p>
                </div>

                <button 
                  type="submit"
                  disabled={!settleUpAmount || parseFloat(settleUpAmount) <= 0 || parseFloat(settleUpAmount) > settleUpData.maxAmount}
                  className="w-full bg-emerald-500 text-white rounded-2xl py-4 font-bold text-lg hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-100 disabled:opacity-50 disabled:shadow-none"
                >
                  Confirm Payment
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      )}

      {/* Private Chat Modal */}
      {chatTargetUser && (
        <PrivateChatModal 
          targetUser={chatTargetUser} 
          onClose={() => setChatTargetUser(null)} 
        />
      )}
    </div>
  );
}
