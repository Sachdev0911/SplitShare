export interface User {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
  createdAt: string;
}

export interface Expense {
  id: string;
  description: string;
  totalAmount: number;
  currency: string;
  paidById: string;
  groupId: string;
  splitType: 'equal' | 'exact' | 'percentage' | 'shares';
  splits: Record<string, number>;
  status: 'pending' | 'approved' | 'declined';
  approvals: string[]; // List of user IDs who approved
  createdAt: string;
}

export interface Payment {
  id: string;
  fromUser: string;
  toUser: string;
  amount: number;
  status: 'pending' | 'completed';
  createdAt: string;
}

export interface Balance {
  userId: string;
  amount: number; // Positive means user is owed, negative means user owes
}

export interface Invitation {
  id: string;
  groupId: string;
  groupName: string;
  inviterId: string;
  inviterName: string;
  inviteeEmail: string;
  inviteeId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  type: 'private' | 'group';
  participants?: string[];
  groupId?: string;
  senderId: string;
  receiverId?: string;
  content: string;
  createdAt: string;
}
