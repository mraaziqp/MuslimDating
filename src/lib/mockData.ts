import { doc, setDoc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, UserRole, Gender } from '../types';

const MOCK_PARENTS = [
  { uid: 'parent_1', displayName: 'Ahmed Al-Farsi', email: 'ahmed@example.com', role: 'Parent/Guardian' as UserRole },
  { uid: 'parent_2', displayName: 'Fatima Zahra', email: 'fatima@example.com', role: 'Parent/Guardian' as UserRole },
];

const MOCK_MAHRAMS = [
  { uid: 'mahram_1', displayName: 'Brother Omar', email: 'omar_m@example.com', role: 'Mahram' as UserRole },
];

const MOCK_SEEKERS: Partial<UserProfile>[] = [
  {
    uid: 'seeker_1',
    displayName: 'Zaid Khan',
    email: 'zaid@example.com',
    role: 'Independent Seeker',
    gender: 'male',
    age: 28,
    profession: 'Software Engineer',
    location: 'London, UK',
    prayerFrequency: 'Always',
    dietaryHabits: 'Strictly Halal',
    isIntroCompleted: true,
    completedModules: ['intro', 'finance'],
    bio: 'Looking for someone who values growth and Deen.',
    requiresParentalVetting: true,
  },
  {
    uid: 'seeker_2',
    displayName: 'Aisha Malik',
    email: 'aisha@example.com',
    role: 'Dependent Seeker',
    gender: 'female',
    age: 24,
    profession: 'Graphic Designer',
    location: 'Manchester, UK',
    prayerFrequency: 'Always',
    dietaryHabits: 'Strictly Halal',
    isIntroCompleted: true,
    completedModules: ['intro', 'wali'],
    bio: 'Family-oriented and creative soul.',
    parentUid: 'parent_2',
  },
  {
    uid: 'seeker_3',
    displayName: 'Omar Hassan',
    email: 'omar@example.com',
    role: 'Independent Seeker',
    gender: 'male',
    age: 31,
    profession: 'Doctor',
    location: 'Birmingham, UK',
    prayerFrequency: 'Usually',
    dietaryHabits: 'Halal',
    isIntroCompleted: false,
    completedModules: [],
    bio: 'Dedicated to my profession and looking for a companion.',
  },
  {
    uid: 'seeker_4',
    displayName: 'Maryam Siddiqui',
    email: 'maryam@example.com',
    role: 'Independent Seeker',
    gender: 'female',
    age: 27,
    profession: 'Teacher',
    location: 'London, UK',
    prayerFrequency: 'Always',
    dietaryHabits: 'Strictly Halal',
    isIntroCompleted: true,
    completedModules: ['intro'],
    bio: 'Passionate about education and community service.',
  },
  {
    uid: 'seeker_5',
    displayName: 'Hassan Aziz',
    email: 'hassan@example.com',
    role: 'Dependent Seeker',
    gender: 'male',
    age: 29,
    profession: 'Architect',
    location: 'Dubai, UAE',
    prayerFrequency: 'Always',
    dietaryHabits: 'Strictly Halal',
    isIntroCompleted: true,
    completedModules: ['intro', 'finance', 'wali'],
    bio: 'Seeking a partner for a life filled with purpose.',
    parentUid: 'parent_1',
  },
];

export const seedMockData = async () => {
  try {
    // Seed Parents
    for (const parent of MOCK_PARENTS) {
      await setDoc(doc(db, 'users', parent.uid), {
        ...parent,
        createdAt: new Date().toISOString(),
      });
    }

    // Seed Mahrams
    for (const mahram of MOCK_MAHRAMS) {
      await setDoc(doc(db, 'users', mahram.uid), {
        ...mahram,
        createdAt: new Date().toISOString(),
      });
    }

    // Seed Seekers
    for (const seeker of MOCK_SEEKERS) {
      await setDoc(doc(db, 'users', seeker.uid!), {
        ...seeker,
        createdAt: new Date().toISOString(),
      });
    }

    console.log('Mock data seeded successfully');
    return true;
  } catch (error) {
    console.error('Error seeding mock data:', error);
    return false;
  }
};
