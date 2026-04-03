import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, getDocFromServer, onSnapshot } from 'firebase/firestore';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState<string>('pending');
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    // Check if offline mode is enabled
    const offlineModeEnabled = localStorage.getItem('offline-mode') === 'true';
    setIsOfflineMode(offlineModeEnabled);

    if (offlineModeEnabled) {
      // In offline mode, create a mock user
      const mockUser = {
        uid: 'offline-user',
        email: 'offline@local',
        displayName: 'Offline User',
      } as User;
      
      setUser(mockUser);
      setUserData({
        name: 'Offline User',
        photoURL: '',
        approved: true,
        role: 'scout',
      });
      setIsApproved(true);
      setIsAdmin(false);
      setRole('scout');
      setIsAuthChecking(false);
      return;
    }

    // Set a 5-second timeout to auto-enable offline mode if auth takes too long
    const timeoutId = setTimeout(() => {
      console.log('Auth timeout - enabling offline mode');
      localStorage.setItem('offline-mode', 'true');
      setIsOfflineMode(true);
      const mockUser = {
        uid: 'offline-user',
        email: 'offline@local',
        displayName: 'Offline User',
      } as User;
      
      setUser(mockUser);
      setUserData({
        name: 'Offline User',
        photoURL: '',
        approved: true,
        role: 'scout',
      });
      setIsApproved(true);
      setIsAdmin(false);
      setRole('scout');
      setIsAuthChecking(false);
    }, 5000);

    let unsubscribeUserDoc: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Clear timeout if auth resolves in time
      clearTimeout(timeoutId);
      
      setUser(currentUser);
      unsubscribeUserDoc?.();
      unsubscribeUserDoc = undefined;
      
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const applyUserData = (data: any) => {
            const nextRole = String(data.role || (currentUser.email === 'scout@mvrt.com' ? 'admin' : 'pending'));
            const nextIsAdmin = nextRole === 'admin' || currentUser.email === 'scout@mvrt.com';

            setUserData({
              ...data,
              name: String(data.name || currentUser.displayName || ''),
              photoURL: String(data.photoURL || currentUser.photoURL || ''),
              approved: Boolean(data.approved) || currentUser.email === 'scout@mvrt.com',
              role: nextRole,
            });
            setIsApproved(Boolean(data.approved) || currentUser.email === 'scout@mvrt.com');
            setIsAdmin(nextIsAdmin);
            setRole(nextRole);
          };

          const initialDoc = await getDocFromServer(userRef);
          applyUserData(initialDoc.exists() ? initialDoc.data() : {});

          unsubscribeUserDoc = onSnapshot(
            userRef,
            (userDoc) => {
              applyUserData(userDoc.exists() ? userDoc.data() : {});
            },
            (error) => {
              console.error('Error subscribing to user data:', error);
              setUserData({
                name: currentUser.displayName || '',
                photoURL: currentUser.photoURL || '',
                approved: currentUser.email === 'scout@mvrt.com',
                role: currentUser.email === 'scout@mvrt.com' ? 'admin' : 'pending',
              });
              setIsApproved(currentUser.email === 'scout@mvrt.com');
              setIsAdmin(currentUser.email === 'scout@mvrt.com');
              setRole(currentUser.email === 'scout@mvrt.com' ? 'admin' : 'pending');
            }
          );
        } catch (error) {
          console.error("Error fetching user data:", error);
          setIsApproved(false);
          setRole('pending');
        }
      } else {
        setUserData(null);
        setIsApproved(false);
        setIsAdmin(false);
        setRole('pending');
      }
      
      setIsAuthChecking(false);
    });

    return () => {
      unsubscribeUserDoc?.();
      unsubscribe();
    };
  }, []);

  return { user, userData, isAuthChecking, isApproved, isAdmin, role, isOfflineMode };
}
