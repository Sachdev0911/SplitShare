import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, MessageCircle, Users, User as UserIcon, ChevronLeft } from "lucide-react";
import { db, collection, query, where, orderBy, onSnapshot, addDoc, OperationType, handleFirestoreError, getDocs } from "../firebase";
import { useAuth } from "../App";
import { Message, User, Group } from "../types";

export default function ChatDrawer() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<{ type: 'private' | 'group', id: string, name: string, photoURL?: string } | null>(null);
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Load groups and contacts
  useEffect(() => {
    if (!user || !isOpen) return;

    setLoadingContacts(true);
    const q = query(
      collection(db, "groups"),
      where("members", "array-contains", user.id)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const loadedGroups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setGroups(loadedGroups);

      // Extract unique member IDs from all groups
      const memberIds = new Set<string>();
      loadedGroups.forEach(g => g.members.forEach(m => {
        if (m !== user.id) memberIds.add(m);
      }));

      // Fetch user details for contacts
      const loadedContacts: User[] = [];
      for (const mId of Array.from(memberIds)) {
        try {
          const userDoc = await getDocs(query(collection(db, "users"), where("id", "==", mId)));
          if (!userDoc.empty) {
            loadedContacts.push(userDoc.docs[0].data() as User);
          }
        } catch (error) {
          console.error("Error fetching contact:", error);
        }
      }
      setContacts(loadedContacts);
      setLoadingContacts(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "groups");
      setLoadingContacts(false);
    });

    return () => unsubscribe();
  }, [user, isOpen]);

  if (!user) return null;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-500 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-emerald-600 transition-all hover:scale-105 z-40"
      >
        <MessageCircle size={24} />
      </button>

      {/* Drawer Overlay */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50"
            />
            
            {/* Drawer Content */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col"
            >
              {activeChat ? (
                <ChatView 
                  chat={activeChat} 
                  onBack={() => setActiveChat(null)} 
                  onClose={() => setIsOpen(false)} 
                />
              ) : (
                <div className="flex flex-col h-full">
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
                    <h2 className="text-xl font-black text-gray-900">Messages</h2>
                    <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                      <X size={20} className="text-gray-500" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Groups Section */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
                        <Users size={14} /> Group Chats
                      </h3>
                      <div className="space-y-1">
                        {groups.length === 0 ? (
                          <p className="text-sm text-gray-500 px-2">No groups yet.</p>
                        ) : (
                          groups.map(group => (
                            <button
                              key={group.id}
                              onClick={() => setActiveChat({ type: 'group', id: group.id, name: group.name })}
                              className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl transition-colors text-left"
                            >
                              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                <Users size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-gray-900 truncate">{group.name}</h4>
                                <p className="text-xs text-gray-500 truncate">{group.members.length} members</p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Direct Messages Section */}
                    <div>
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2 flex items-center gap-2">
                        <UserIcon size={14} /> Direct Messages
                      </h3>
                      <div className="space-y-1">
                        {loadingContacts ? (
                          <div className="flex justify-center p-4">
                            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        ) : contacts.length === 0 ? (
                          <p className="text-sm text-gray-500 px-2">No contacts yet. Join a group to chat!</p>
                        ) : (
                          contacts.map(contact => (
                            <button
                              key={contact.id}
                              onClick={() => setActiveChat({ type: 'private', id: contact.id, name: contact.name, photoURL: contact.photoURL })}
                              className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-2xl transition-colors text-left"
                            >
                              <img 
                                src={contact.photoURL || `https://ui-avatars.com/api/?name=${contact.name}`} 
                                alt="" 
                                className="w-10 h-10 rounded-full shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-gray-900 truncate">{contact.name}</h4>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function ChatView({ chat, onBack, onClose }: { chat: { type: 'private' | 'group', id: string, name: string, photoURL?: string }, onBack: () => void, onClose: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [senders, setSenders] = useState<Record<string, User>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversationId = chat.type === 'private' && user
    ? [user.id, chat.id].sort().join('_')
    : chat.id;

  useEffect(() => {
    if (!user || !conversationId) return;

    const q = query(
      collection(db, "messages"),
      where("conversationId", "==", conversationId),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
      
      // Fetch sender details for group chats
      if (chat.type === 'group') {
        const senderIds = new Set(msgs.map(m => m.senderId));
        const newSenders: Record<string, User> = { ...senders };
        let fetched = false;
        
        for (const sId of Array.from(senderIds)) {
          if (!newSenders[sId]) {
            try {
              const userDoc = await getDocs(query(collection(db, "users"), where("id", "==", sId)));
              if (!userDoc.empty) {
                newSenders[sId] = userDoc.docs[0].data() as User;
                fetched = true;
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
        if (fetched) setSenders(newSenders);
      }

      setLoading(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "messages");
    });

    return () => unsubscribe();
  }, [user, conversationId, chat.type]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim() || !conversationId) return;

    const content = newMessage.trim();
    setNewMessage("");

    try {
      const messageData: any = {
        conversationId,
        type: chat.type,
        senderId: user.id,
        content,
        createdAt: new Date().toISOString()
      };

      if (chat.type === 'private') {
        messageData.participants = [user.id, chat.id];
        messageData.receiverId = chat.id;
      } else {
        messageData.groupId = chat.id;
      }

      await addDoc(collection(db, "messages"), messageData);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "messages");
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors -ml-2">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          {chat.type === 'private' ? (
            <img 
              src={chat.photoURL || `https://ui-avatars.com/api/?name=${chat.name}`} 
              className="w-10 h-10 rounded-full" 
              alt="" 
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Users size={20} />
            </div>
          )}
          <div>
            <h2 className="text-sm font-bold text-gray-900">{chat.name}</h2>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">{chat.type} Chat</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <X size={20} className="text-gray-500" />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <p className="text-sm">No messages yet.</p>
            <p className="text-xs mt-1">Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.senderId === user.id;
            const showSenderName = chat.type === 'group' && !isMe && (index === 0 || messages[index - 1].senderId !== msg.senderId);
            
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {showSenderName && (
                  <span className="text-[10px] font-bold text-gray-500 mb-1 ml-1">
                    {senders[msg.senderId]?.name || "..."}
                  </span>
                )}
                <div 
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    isMe 
                      ? 'bg-emerald-500 text-white rounded-tr-sm' 
                      : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'
                  }`}
                >
                  <p className="text-sm break-words">{msg.content}</p>
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
    </div>
  );
}
