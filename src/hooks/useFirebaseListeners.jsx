import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  where, 
  doc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../App';

export const useFirebaseListeners = (currentUser, isAdmin, isSuperAdmin) => {
  // Estados para los datos
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  
  // Estados de control
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [listenersActive, setListenersActive] = useState(false);

  console.log('🔥 useFirebaseListeners inicialitzant...', {
    hasUser: !!currentUser,
    userEmail: currentUser?.email,
    isAdmin,
    isSuperAdmin
  });

  // CORRECCIÓ: Funcions helper per gestionar errors
  const handleFirestoreError = useCallback((error, context) => {
    console.error(`❌ Error Firestore (${context}):`, error);
    
    if (error.code === 'permission-denied') {
      setError(`Permisos insuficients per ${context}`);
    } else if (error.code === 'unavailable') {
      setError('Servei temporalment no disponible');
    } else if (error.code === 'failed-precondition') {
      setError('Error de configuració Firebase');
    } else {
      setError(`Error ${context}: ${error.message}`);
    }
  }, []);

  // CORRECCIÓ: Assegurar que l'usuari està registrat
  const ensureUserInFirestore = useCallback(async (user) => {
    if (!user) return;
    
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'Usuari',
        lastSeen: serverTimestamp(),
        isOnline: true
      }, { merge: true });
      
      // Si és el super admin, assegurar document admin
      if (user.uid === 's1UefGdgQphElib4KWmDsQj1uor2') {
        const adminRef = doc(db, 'admins', user.uid);
        await setDoc(adminRef, {
          uid: user.uid,
          email: user.email,
          isSuperAdmin: true,
          createdAt: serverTimestamp()
        }, { merge: true });
        console.log('✅ Super admin registrat');
      }
      
    } catch (error) {
      console.error('❌ Error registrant usuari:', error);
    }
  }, []);

  // Setup de listeners
  useEffect(() => {
    if (!currentUser || listenersActive) return;

    console.log('🚀 Configurant listeners Firebase per:', currentUser.email);
    setLoading(true);
    setError(null);

    // Primer assegurem que l'usuari està registrat
    ensureUserInFirestore(currentUser).then(() => {
      const unsubscribers = [];

      try {
        // 1. Listener per RUTES
        console.log('📍 Configurant listener per rutes...');
        const routesQuery = query(
          collection(db, 'routes'),
          where('active', '==', true),
          orderBy('createdAt', 'desc')
        );

        const unsubRoutes = onSnapshot(routesQuery, 
          (snapshot) => {
            const routesData = [];
            snapshot.forEach((doc) => {
              routesData.push({
                id: doc.id,
                ...doc.data()
              });
            });
            console.log('📍 Rutes actualitzades:', routesData.length);
            setRoutes(routesData);
          },
          (error) => handleFirestoreError(error, 'carregant rutes')
        );
        unsubscribers.push(unsubRoutes);

        // 2. Listener per USUARIS ACTIUS
        console.log('👥 Configurant listener per usuaris actius...');
        const usersQuery = query(
          collection(db, 'users'),
          where('isOnline', '==', true),
          orderBy('lastSeen', 'desc')
        );

        const unsubUsers = onSnapshot(usersQuery,
          (snapshot) => {
            const usersData = [];
            snapshot.forEach((doc) => {
              usersData.push({
                id: doc.id,
                ...doc.data()
              });
            });
            console.log('👥 Usuaris actius actualitzats:', usersData.length);
            setUsers(usersData);
          },
          (error) => handleFirestoreError(error, 'carregant usuaris actius')
        );
        unsubscribers.push(unsubUsers);

        // 3. Listener per INCIDÈNCIES
        console.log('🚨 Configurant listener per incidències...');
        const incidentsQuery = query(
          collection(db, 'incidents'),
          orderBy('timestamp', 'desc')
        );

        const unsubIncidents = onSnapshot(incidentsQuery,
          (snapshot) => {
            const incidentsData = [];
            snapshot.forEach((doc) => {
              incidentsData.push({
                id: doc.id,
                ...doc.data()
              });
            });
            console.log('🚨 Incidències actualitzades:', incidentsData.length);
            setIncidents(incidentsData);
          },
          (error) => handleFirestoreError(error, 'carregant incidències')
        );
        unsubscribers.push(unsubIncidents);

        setListenersActive(true);
        setLoading(false);
        console.log('✅ Tots els listeners configurats correctament');

      } catch (error) {
        console.error('❌ Error configurant listeners:', error);
        handleFirestoreError(error, 'configurant listeners');
        setLoading(false);
      }

      // Cleanup function
      return () => {
        console.log('🧹 Netejant listeners Firebase...');
        unsubscribers.forEach(unsub => {
          if (typeof unsub === 'function') {
            unsub();
          }
        });
        setListenersActive(false);
      };
    });

  }, [currentUser?.uid, listenersActive, ensureUserInFirestore, handleFirestoreError]);

  // Carregar tots els usuaris (només per admins)
  const loadAllUsers = useCallback(async () => {
    if (!isAdmin && !isSuperAdmin) {
      console.log('⚠️ No és admin - no pot carregar tots els usuaris');
      return;
    }

    try {
      console.log('👥 Carregant tots els usuaris...');
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const allUsersData = [];
      
      usersSnapshot.forEach((doc) => {
        allUsersData.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      console.log('✅ Tots els usuaris carregats:', allUsersData.length);
      setAllUsers(allUsersData);
      
    } catch (error) {
      console.error('❌ Error carregant tots els usuaris:', error);
      handleFirestoreError(error, 'carregant tots els usuaris');
    }
  }, [isAdmin, isSuperAdmin, handleFirestoreError]);

  // Fer usuari admin (només super admin)
  const makeUserAdmin = useCallback(async (userId, userEmail) => {
    if (!isSuperAdmin) {
      console.log('⚠️ No és super admin - no pot crear admins');
      setError('Només el super admin pot crear administradors');
      return false;
    }

    try {
      console.log('👑 Fent admin a usuari:', userEmail);
      
      const adminRef = doc(db, 'admins', userId);
      await setDoc(adminRef, {
        uid: userId,
        email: userEmail,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        isSuperAdmin: false
      });
      
      console.log('✅ Usuari fet admin correctament');
      return true;
      
    } catch (error) {
      console.error('❌ Error fent usuari admin:', error);
      handleFirestoreError(error, 'fent usuari admin');
      return false;
    }
  }, [isSuperAdmin, currentUser, handleFirestoreError]);

  // Eliminar ruta
  const deleteRoute = useCallback(async (routeId) => {
    if (!isAdmin && !isSuperAdmin) {
      console.log('⚠️ No és admin - no pot eliminar rutes');
      return false;
    }

    try {
      console.log('🗑️ Eliminant ruta:', routeId);
      
      // Marcar com eliminada en lloc d'eliminar físicament
      const routeRef = doc(db, 'routes', routeId);
      await updateDoc(routeRef, {
        deleted: true,
        active: false,
        deletedBy: currentUser.uid,
        deletedAt: serverTimestamp()
      });
      
      console.log('✅ Ruta eliminada correctament');
      return true;
      
    } catch (error) {
      console.error('❌ Error eliminant ruta:', error);
      handleFirestoreError(error, 'eliminant ruta');
      return false;
    }
  }, [isAdmin, isSuperAdmin, currentUser, handleFirestoreError]);

  // Resoldre incidència
  const resolveIncident = useCallback(async (incidentId) => {
    if (!isAdmin && !isSuperAdmin) {
      console.log('⚠️ No és admin - no pot resoldre incidències');
      return false;
    }

    try {
      console.log('✅ Resolent incidència:', incidentId);
      
      const incidentRef = doc(db, 'incidents', incidentId);
      await updateDoc(incidentRef, {
        resolved: true,
        resolvedBy: currentUser.uid,
        resolvedByName: currentUser.displayName || currentUser.email,
        resolvedAt: serverTimestamp()
      });
      
      console.log('✅ Incidència resolta correctament');
      return true;
      
    } catch (error) {
      console.error('❌ Error resolent incidència:', error);
      handleFirestoreError(error, 'resolent incidència');
      return false;
    }
  }, [isAdmin, isSuperAdmin, currentUser, handleFirestoreError]);

  // Refrescar dades manualment
  const refreshData = useCallback(async () => {
    console.log('🔄 Refrescant dades manualment...');
    
    // Recarregar tots els usuaris si és admin
    if (isAdmin || isSuperAdmin) {
      await loadAllUsers();
    }
    
    // Actualitzar estat de l'usuari actual
    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          lastSeen: serverTimestamp(),
          isOnline: true
        });
      } catch (error) {
        console.warn('⚠️ No s\'ha pogut actualitzar estat usuari:', error);
      }
    }
    
    console.log('✅ Refrescament completat');
  }, [isAdmin, isSuperAdmin, loadAllUsers, currentUser]);

  // Cleanup quan l'usuari es desconnecta
  useEffect(() => {
    if (!currentUser) {
      console.log('🧹 Usuari desconnectat - netejant estat');
      setRoutes([]);
      setUsers([]);
      setIncidents([]);
      setAllUsers([]);
      setLoading(false);
      setError(null);
      setListenersActive(false);
    }
  }, [currentUser]);

  // Auto-carregar tots els usuaris per admins
  useEffect(() => {
    if ((isAdmin || isSuperAdmin) && currentUser && !loading) {
      loadAllUsers();
    }
  }, [isAdmin, isSuperAdmin, currentUser, loading, loadAllUsers]);

  // Debug logging
  useEffect(() => {
    console.log('📊 useFirebaseListeners estat:', {
      loading,
      error,
      listenersActive,
      routesCount: routes.length,
      usersCount: users.length,
      incidentsCount: incidents.length,
      allUsersCount: allUsers.length
    });
  }, [loading, error, listenersActive, routes.length, users.length, incidents.length, allUsers.length]);

  return {
    // Dades
    routes,
    users,
    incidents,
    allUsers,
    
    // Estats
    loading,
    error,
    
    // Funcions
    loadAllUsers,
    makeUserAdmin,
    deleteRoute,
    resolveIncident,
    refreshData
  };
};
