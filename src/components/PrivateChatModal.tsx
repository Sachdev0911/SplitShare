import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send } from "lucide-react";
import { db, collection, query, where, orderBy, onSnapshot, addDoc, OperationType, handleFirestoreError } from "../firebase";
import { useAuth } from "../App";
import { Message, User } from "../types";

interface PrivateChatModalProps {
  targetUser: User;
  onClose: () => void;
}

export default function PrivateChatModal({ targetUser, onClose }: PrivateChatModalProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationId = user && targetUser 
    ? [user.id, targetUser.id].sort().join('_') 
    : "";

  useEffect(() => {
    if (!user || !targetUser || !conversationId) return;

    const q = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message)));
      setLoading(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "messages");
    });

    return () => unsubscribe();
  }, [user, targetUser, conversationId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !targetUser || !newMessage.trim() || !conversationId) return;

    const content = newMessage.trim();
    setNewMessage("");

    try {
      await addDoc(collection(db, "messages"), {
        conversationId,
        type: 'private',
        participants: [user.id, targetUser.id],
        senderId: user.id,
        receiverId: targetUser.id,
        content,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "messages");
    }
  };

  if (!user) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] overflow-y-auto bg-black/40 backdrop-blur-md">
        <div className="min-h-full flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md border border-gray-100 my-8 flex flex-col overflow-hidden"
            style={{ height: '600px', maxHeight: '80vh' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-white z-10">
              <div className="flex items-center gap-3">
                <img 
                  src={targetUser.photoURL || `https://ui-avatars.com/api/?name=${targetUser.name}`} 
                  className="w-10 h-10 rounded-full" 
                  alt="" 
                />
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{targetUser.name}</h2>
                  <p className="text-xs text-gray-500">Private Chat</p>
                </div>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-2 bg-gray-50 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50 flex flex-col gap-4">
              {loading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <p className="text-sm">No messages yet.</p>
                  <p className="text-xs mt-1">Say hi to {targetUser.name}!</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.senderId === user.id;
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div 
                        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                          isMe 
                            ? 'bg-emerald-500 text-white rounded-tr-sm' 
                            : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className={`text-[9px] mt-1 text-right ${isMe ? 'text-emerald-100' : 'text-gray-400'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-100">
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-50 border-0 rounded-full px-5 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <button 
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="bg-emerald-500 text-white w-12 h-12 rounded-full flex items-center justify-center hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:hover:bg-emerald-500 shrink-0"
                >
                  <Send size={18} className="ml-1" />
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
