export type UserRole = 'Independent Seeker' | 'Dependent Seeker' | 'Parent/Guardian' | 'Mahram';
export type Gender = 'male' | 'female';
export type ConnectionStatus = 'pending_parent_approval' | 'pending_receiver_approval' | 'approved' | 'declined';
export type ApprovalStatus = 'pending' | 'approved' | 'declined';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  gender?: Gender;
  requiresParentalVetting?: boolean;
  parentUid?: string;
  isIntroCompleted?: boolean;
  completedModules?: string[];
  photoUrl?: string;
  bio?: string;
  age?: number;
  location?: string;
  profession?: string;
  prayerFrequency?: 'Always' | 'Usually' | 'Sometimes' | 'Rarely';
  dietaryHabits?: 'Strictly Halal' | 'Halal' | 'Flexible';
  createdAt: string;
}

export interface Connection {
  id: string;
  senderUid: string;
  receiverUid: string;
  status: ConnectionStatus;
  parentApprovalStatus: ApprovalStatus;
  mahramUid?: string;
  photoRevealedBySender?: boolean;
  photoRevealedByReceiver?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  text: string;
  senderUid: string;
  createdAt: string;
}
