// hooks/useAuth.js
import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../App';

export const useAuth = (SUPER_ADMIN_UID) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdminStatus = async (user) => {
    try {
      console.log('👑 Verificant estat admin per:', user.uid);
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      const userData = userDoc.exists() ? userDoc.data() : null;
      
      const isSuperAdminUser = user.uid === SUPER_ADMIN_UID;
      
      if (isSuperAdminUser) {
        setIsAdmin(true);
        setIsSuperAdmin(true);
        if (!userData) {
          await setDoc(userDocRef, {
            name: user.displayName || user.email,
            email: user.email,
            isAdmin: true,
            isSuperAdmin: true
          });
        }
      } else if (userData) {
        setIsAdmin(userData.isAdmin === true);
        setIsSuperAdmin(userData.isSuperAdmin === true);
      } else {
        await setDoc(userDocRef, {
          name: user.displayName || user.email,
          email: user.email,
          isAdmin: false,
          isSuperAdmin: false
        });
        setIsAdmin(false);
        setIsSuperAdmin(false);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error checking admin status:', error);
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw error;
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name');
    const email = formData.get('email');
    const password = formData.get('password');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(userDocRef, {
        name: name,
        email: email,
        isAdmin: false
      });
    } catch (error) {
      throw error;
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      throw error;
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await checkAdminStatus(user);
      } else {
        setCurrentUser(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [SUPER_ADMIN_UID]);

  return {
    currentUser,
    isAdmin,
    isSuperAdmin,
    loading,
    handleLogin,
    handleRegister,
    handleLogout
  };
};