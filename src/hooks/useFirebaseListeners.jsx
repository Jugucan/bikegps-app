import { useState, useEffect, useCallback } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  updateDoc, 
  deleteDoc,
  setDoc,
  serverTimestamp,
  getDocs,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db } from '../App';

export const useFirebaseListeners = (currentUser, isAdmin, isSuperAdmin) => {
  // Estados para los datos
  const [routes, setRoutes] = useState(null); // null indica no inicializado
  const [users, setUsers] = useState(null);
  const [incidents, setIncidents] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  
  // Estados de control
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [listenersActive, setListenersActive] = useState(false);

  console.log('🔥 useFirebaseListeners inicializando...', {
    hasUser: !!currentUser,
    userEmail: currentUser?.email,
    isAdmin,
    isSuperAdmin
  });

  // CORRECCIÓ: Reset error després d'un temps
  const clearError = useCallback(() => {
    setTimeout(() => setError(null), 5000);
  }, []);

  // CORRECCIÓ: Funcions helper per gestionar errors
  const handleFirestoreError = useCallback((error, context) => {
    console.error(`❌ Error Firestore (${context}):`, error);
    
    let errorMessage;
    if (error.code === 'permission-denied') {
      errorMessage = `Permisos insuficients per ${context}`;
    } else if (error.code === 'unavailable') {
      errorMessage = 'Servei temporalment no disponible';
    } else if (error.code === 'failed-precondition') {
      errorMessage = `Base de dades configurant-se...`;
      console.warn(`⚠️ Possible index requerit per ${context}`);
    } else {
      errorMessage = `Error ${context}`;
    }
    
    setError(errorMessage);
    clearError();
  }, [clearError]);

  // CORRECCIÓ: Assegurar que l'usuari està registrat de manera més robusta
  const ensureUserInFirestore = useCallback(async (user) => {
    if (!user) return;
    
    try {
      console.log('👤 Registrant/actualitzant usuari:', user.email);
      
      const userRef = doc(db, 'users', user.uid);
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || 'Usuari',
        lastSeen: serverTimestamp(),
        isOnline: true,
        updatedAt: serverTimestamp()
      };

      // Si és el primer cop, afegir createdAt
      if (!user.metadata?.creationTime || 
          (Date.now() - new Date(user.metadata.creationTime).getTime()) < 60000) {
        userData.createdAt = serverTimestamp();
      }

      await setDoc(userRef, userData, { merge: true });
      console.log('✅ Usuari actualitzat a Firestore');
      
      // Si és el super admin, assegurar document admin
      if (user.uid === 's1UefGdgQphElib4KWmDsQj1uor2') {
        const adminRef = doc(db, 'admins', user.uid);
        await setDoc(adminRef, {
          uid: user.uid,
          email: user.email,
          isSuperAdmin: true,
          createdAt: serverTimestamp()
        }, { merge: true });
        console.log('✅ Super admin confirmat');
      }
      
    } catch (error) {
      console.error('❌ Error registrant usuari:', error);
      // No bloquejar la app si no es pot registrar l'usuari
    }
  }, []);

  // CORRECCIÓ: Setup de listeners més robust
  useEffect(() => {
    if (!currentUser) {
      // Reset quan no hi ha usuari
      setRoutes([]);
      setUsers([]);
      setIncidents([]);
      setAllUsers([]);
      setLoading(false);
      setError(null);
      setListenersActive(false);
      return;
    }

    if (listenersActive) return;

    console.log('🚀 Configurant listeners Firebase per:', currentUser.email);
    setLoading(true);
    setError(null);

    // Primer assegurem que l'usuari està registrat
    ensureUserInFirestore(currentUser).then(() => {
      const unsubscribers = [];
      let listenersSetup = 0;
      const totalListeners = 3;

      const checkAllListenersReady = () => {
        listenersSetup++;
        if (listenersSetup >= totalListeners) {
          setLoading(false);
          setListenersActive(true);
          console.log('✅ Tots els listeners configurats');
        }
      };

      try {
        // 1. LISTENER RUTES - Query super simple
        console.log('📍 Configurant listener rutes...');
        
        const routesRef = collection(db, 'routes');
        
        const unsubRoutes = onSnapshot(routesRef, 
          (snapshot) => {
            try {
              const routesData = [];
              snapshot.forEach((doc) => {
                const data = doc.data();
                // Filtrar només rutes actives en el client
                if (data.active !== false && data.deleted !== true) {
                  routesData.push({
                    id: doc.id,
                    ...data
                  });
                }
              });
              
              // Ordenar per data de creació (client-side)
              routesData.sort((a, b) => {
                const aTime = a.createdAt?.seconds || 0;
                const bTime = b.createdAt?.seconds || 0;
                return bTime - aTime;
              });
              
              console.log('📍 Rutes carregades:', routesData.length);
              setRoutes(routesData);
              checkAllListenersReady();
            } catch (err) {
              console.error('Error processant rutes:', err);
              setRoutes([]);
              checkAllListenersReady();
            }
          },
          (error) => {
            console.error('❌ Error listener rutes:', error);
            handleFirestoreError(error, 'carregant rutes');
            setRoutes([]);
            checkAllListenersReady();
          }
        );
        unsubscribers.push(unsubRoutes);

        // 2. LISTENER USUARIS - Query simple
        console.log('👥 Configurant listener usuaris...');
        
        const usersRef = collection(db, 'users');
        
        const unsubUsers = onSnapshot(usersRef,
          (snapshot) => {
            try {
              const usersData = [];
              const now = Timestamp.now();
              const fiveMinutesAgo = Timestamp.fromMillis(now.toMillis() - 5 * 60 * 1000);
              
              snapshot.forEach((doc) => {
                const data = doc.data();
                // Considerar usuari actiu si ha estat online recentment
                const isRecentlyActive = data.lastSeen && 
                  data.lastSeen.seconds > fiveMinutesAgo.seconds;
                
                if (isRecentlyActive || data.isOnline) {
                  usersData.push({
                    id: doc.id,
                    ...data
                  });
                }
              });
              
              // Ordenar per últim vist
              usersData.sort((a, b) => {
                const aTime = a.lastSeen?.seconds || 0;
                const bTime = b.lastSeen?.seconds || 0;
                return bTime - aTime;
              });
              
              console.log('👥 Usuaris actius:', usersData.length);
              setUsers(usersData);
              checkAllListenersReady();
            } catch (err) {
              console.error('Error processant usuaris:', err);
              setUsers([]);
              checkAllListenersReady();
            }
          },
          (error) => {
            console.error('❌ Error listener usuaris:', error);
            handleFirestoreError(error, 'carregant usuaris');
            setUsers([]);
            checkAllListenersReady();
          }
        );
        unsubscribers.push(unsubUsers);

        // 3. LISTENER INCIDÈNCIES - Query simple
        console.log('🚨 Configurant listener incidències...');
        
        const incidentsRef = collection(db, 'incidents');
        
        const unsubIncidents = onSnapshot(incidentsRef,
          (snapshot) => {
            try {
              const incidentsData = [];
              snapshot.forEach((doc) => {
                incidentsData.push({
                  id: doc.id,
                  ...doc.data()
                });
              });
              
              // Ordenar per timestamp (més recent primer)
              incidentsData.sort((a, b) => {
                const aTime = a.timestamp?.seconds || 0;
                const bTime = b.timestamp?.seconds || 0;
                return bTime - aTime;
              });
              
              console.log('🚨 Incidències:', incidentsData.length);
              setIncidents(incidentsData);
              checkAllListenersReady();
            } catch (err) {
              console.error('Error processant incidències:', err);
              setIncidents([]);
              checkAllListenersReady();
            }
          },
          (error) => {
            console.error('❌ Error listener incidències:', error);
            handleFirestoreError(error, 'carregant incidències');
            setIncidents([]);
            checkAllListenersReady();
          }
        );
        unsubscribers.push(unsubIncidents);

      } catch (error) {
        console.error('❌ Error configurant listeners:', error);
        handleFirestoreError(error, 'configurant connexió');
        setLoading(false);
      }

      // Cleanup function
      return () => {
        console.log('🧹 Netejant listeners Firebase...');
        unsubscribers.forEach(unsub => {
          if (typeof unsub === 'function') {
            try {
              unsub();
            } catch (err) {
              console.warn('Error netejant listener:', err);
            }
          }
        });
        setListenersActive(false);
      };
    }).catch(error => {
      console.error('❌ Error inicialitzant usuari:', error);
      setLoading(false);
    });

  }, [currentUser?.uid, listenersActive, ensureUserInFirestore, handleFirestoreError]);

  // Carregar tots els usuaris (només per admins)
  const loadAllUsers = useCallback(async () => {
    if (!isAdmin && !isSuperAdmin) {
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
      
      // Ordenar per últim vist
      allUsersData.sort((a, b) => {
        const aTime = a.lastSeen?.seconds || 0;
        const bTime = b.lastSeen?.seconds || 0;
        return bTime - aTime;
      });
      
      console.log('✅ Tots els usuaris carregats:', allUsersData.length);
      setAllUsers(allUsersData);
      
    } catch (error) {
      console.error('❌ Error carregant tots els usuaris:', error);
      handleFirestoreError(error, 'carregant llista usuaris');
    }
  }, [isAdmin, isSuperAdmin, handleFirestoreError]);

  // Fer usuari admin (només super admin)
  const makeUserAdmin = useCallback(async (userId, userEmail) => {
    if (!isSuperAdmin) {
      setError('Només el super admin pot crear administradors');
      clearError();
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
      handleFirestoreError(error, 'assignant permisos admin');
      return false;
    }
  }, [isSuperAdmin, currentUser, handleFirestoreError, clearError]);

  // Eliminar ruta
  const deleteRoute = useCallback(async (routeId) => {
    if (!isAdmin && !isSuperAdmin) {
      setError('No tens permisos per eliminar rutes');
      clearError();
      return false;
    }

    try {
      console.log('🗑️ Eliminant ruta:', routeId);
      
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
  }, [isAdmin, isSuperAdmin, currentUser, handleFirestoreError, clearError]);

  // Resoldre incidència
  const resolveIncident = useCallback(async (incidentId) => {
    if (!isAdmin && !isSuperAdmin) {
      setError('No tens permisos per resoldre incidències');
      clearError();
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
  }, [isAdmin, isSuperAdmin, currentUser, handleFirestoreError, clearError]);

  // Refrescar dades manualment
  const refreshData = useCallback(async () => {
    console.log('🔄 Refrescant dades...');
    
    try {
      // Actualitzar estat de l'usuari actual
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          lastSeen: serverTimestamp(),
          isOnline: true
        });
      }
      
      // Recarregar tots els usuaris si és admin
      if (isAdmin || isSuperAdmin) {
        await loadAllUsers();
      }
      
      console.log('✅ Refrescament completat');
    } catch (error) {
      console.warn('⚠️ Error en refrescament parcial:', error);
    }
  }, [currentUser, isAdmin, isSuperAdmin, loadAllUsers]);

  // Auto-carregar tots els usuaris per admins
  useEffect(() => {
    if ((isAdmin || isSuperAdmin) && currentUser && !loading && listenersActive) {
      loadAllUsers();
    }
  }, [isAdmin, isSuperAdmin, currentUser, loading, listenersActive, loadAllUsers]);

  // CORRECCIÓ: Actualitzar estat usuari periòdicament
  useEffect(() => {
    if (!currentUser || !listenersActive) return;

    const updateUserStatus = async () => {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          lastSeen: serverTimestamp(),
          isOnline: true
        });
      } catch (error) {
        console.warn('⚠️ Error actualitzant estat usuari:', error);
      }
    };

    // Actualitzar cada 30 segons
    const interval = setInterval(updateUserStatus, 30000);
    
    return () => clearInterval(interval);
  }, [currentUser, listenersActive]);

  return {
    // Dades
    routes: routes || [], // Sempre retornar array
    users: users || [],
    incidents: incidents || [],
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
