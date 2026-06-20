import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db, onSnapshot, collection, query, where, addDoc, OperationType, handleFirestoreError, deleteDoc, doc, updateDoc, arrayUnion, getDocs } from "../firebase";
import { useAuth } from "../App";
import { Plus, Users, ChevronRight, Trash2, Bell, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Invitation } from "../types";

export default function Dashboard() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "groups"), where("members", "array-contains", user.id));
    const unsubGroups = onSnapshot(q, (snapshot) => {
      setGroups(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "groups");
    });

    const invQ = query(collection(db, "invitations"), where("inviteeId", "==", user.id));
    const unsubInvitations = onSnapshot(invQ, (snapshot) => {
      const allInvs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invitation));
      setInvitations(allInvs.filter(inv => inv.status === "pending"));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "invitations");
    });

    return () => {
      unsubGroups();
      unsubInvitations();
    };
  }, [user]);

  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (!user) return;
    try {
      // Add user to group members
      await updateDoc(doc(db, "groups", invitation.groupId), {
        members: arrayUnion(user.id)
      });
      // Update invitation status
      await updateDoc(doc(db, "invitations", invitation.id), {
        status: 'accepted'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invitations/${invitation.id}`);
    }
  };

  const handleRejectInvitation = async (invitationId: string) => {
    try {
      await updateDoc(doc(db, "invitations", invitationId), {
        status: 'rejected'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `invitations/${invitationId}`);
    }
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;
    try {
      await addDoc(collection(db, "groups"), {
        name: newGroupName,
        members: [user.id],
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "groups");
    }
    setNewGroupName("");
    setShowAddGroup(false);
  };

  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const handleDeleteGroup = async (groupId: string) => {
    setIsDeleting(groupId);
    try {
      // 1. Delete all expenses
      const expensesSnap = await getDocs(collection(db, "groups", groupId, "expenses"));
      const expenseDeletes = expensesSnap.docs.map(doc => deleteDoc(doc.ref));
      
      // 2. Delete all payments
      const paymentsSnap = await getDocs(collection(db, "groups", groupId, "payments"));
      const paymentDeletes = paymentsSnap.docs.map(doc => deleteDoc(doc.ref));
      
      // Execute all subcollection deletes
      await Promise.all([...expenseDeletes, ...paymentDeletes]);
      
      // 3. Delete the group document
      await deleteDoc(doc(db, "groups", groupId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `groups/${groupId}`);
    } finally {
      setIsDeleting(null);
      setGroupToDelete(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Invitations Notification Bar */}
      <AnimatePresence>
        {invitations.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-8 space-y-2"
          >
            {invitations.map((inv) => (
              <div key={inv.id} className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between shadow-sm gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 shrink-0">
                    <Bell size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Group Invitation</p>
                    <p className="text-xs text-gray-600">
                      <span className="font-bold text-emerald-600">{inv.inviterName}</span> invited you to join <span className="font-bold text-gray-900">"{inv.groupName}"</span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                  <button 
                    onClick={() => handleAcceptInvitation(inv)}
                    className="flex-1 sm:flex-none bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-1"
                  >
                    <Check size={14} /> Accept
                  </button>
                  <button 
                    onClick={() => handleRejectInvitation(inv.id)}
                    className="flex-1 sm:flex-none bg-white text-gray-500 border border-gray-100 px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-50 transition-all flex items-center justify-center gap-1"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Manage your groups and expenses.</p>
        </div>
        <button 
          onClick={() => setShowAddGroup(true)}
          className="flex items-center gap-2 bg-emerald-500 text-white px-5 py-3 rounded-2xl font-semibold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 w-full sm:w-auto justify-center"
        >
          <Plus size={20} />
          New Group
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {groups.map((group) => (
            <motion.div
              layout
              key={group.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
            >
              <Link 
                to={`/group/${group.id}`}
                className="block bg-white p-6 rounded-3xl border border-gray-100 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-50 transition-all group"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors">
                    <Users size={24} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setGroupToDelete(group.id);
                      }}
                      disabled={isDeleting === group.id}
                      className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                      title="Delete Group"
                    >
                      {isDeleting === group.id ? (
                        <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Trash2 size={18} />
                      )}
                    </button>
                    <ChevronRight className="text-gray-300 group-hover:text-emerald-500 transition-colors" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{group.name}</h3>
                <p className="text-sm text-gray-500">{group.members.length} members</p>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {showAddGroup && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/20 backdrop-blur-sm">
          <div className="min-h-full flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 max-w-md w-full border border-gray-100 my-8"
            >
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New Group</h2>
            <form onSubmit={handleAddGroup}>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Group Name</label>
                <input 
                  autoFocus
                  type="text" 
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="e.g. Trip to Japan"
                  className="w-full bg-gray-50 border-0 rounded-2xl px-5 py-4 focus:ring-2 focus:ring-emerald-500 transition-all outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowAddGroup(false)}
                  className="flex-1 bg-gray-50 text-gray-600 rounded-2xl py-4 font-semibold hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-emerald-500 text-white rounded-2xl py-4 font-semibold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100"
                >
                  Create
                </button>
              </div>
            </form>
          </motion.div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {groupToDelete && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 backdrop-blur-md">
          <div className="min-h-full flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center border border-gray-100 my-8"
            >
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight mb-2">Delete Group?</h2>
            <p className="text-gray-500 mb-8">Are you sure you want to delete this group and all its expenses? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setGroupToDelete(null)}
                className="flex-1 bg-gray-100 text-gray-600 px-4 py-3 rounded-xl font-bold hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDeleteGroup(groupToDelete)}
                disabled={isDeleting === groupToDelete}
                className="flex-1 bg-red-500 text-white px-4 py-3 rounded-xl font-bold hover:bg-red-600 disabled:opacity-50 transition-all"
              >
                {isDeleting === groupToDelete ? "Deleting..." : "Delete"}
              </button>
            </div>
          </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
