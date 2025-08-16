import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../App';

export const useFirebaseListeners = (currentUser, isAdmin, isSuperAdmin, mapInstanceRef) => {
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  
  // Refs per evitar loops infinits
  const routesListenerRef = useRef(null);
  const usersListenerRef = useRef(null);
  const incidentsListenerRef = useRef(null);

  // Funció per carregar tots els usuaris (només super admin)
  const loadAllUsers = async () => {
    if (!isSuperAdmin) return;
    
    try {
      console.log('👥 Carregant tots els usuaris...');
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAllUsers(usersData);
      console.log(`✅ ${usersData.length} usuaris carregats`);
    } catch (error) {
      console.error('❌ Error carregant usuaris:', error);
    }
  };

  // Funció per fer admin a un usuari
  const makeUserAdmin = async (userId) => {
    if (!isSuperAdmin) return;
    
    try {
      console.log(`👑 Fent admin a l'usuari: ${userId}`);
      await setDoc(doc(db, 'admins', userId), {
        uid: userId,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      console.log('✅ Usuari fet admin correctament');
      
      // Recarregar usuaris
      loadAllUsers();
    } catch (error) {
      console.error('❌ Error fent admin:', error);
    }
  };

  // Funció per eliminar ruta
  const deleteRoute = async (routeId) => {
    if (!isAdmin) return;
    
    try {
      console.log(`🗑️ Eliminant ruta: ${routeId}`);
      await updateDoc(doc(db, 'routes', routeId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: currentUser.uid
      });
      console.log('✅ Ruta eliminada correctament');
    } catch (error) {
      console.error('❌ Error eliminant ruta:', error);
    }
  };

  // Funció per resoldre incidència
  const resolveIncident = async (incidentId) => {
    if (!isAdmin) return;
    
    try {
      console.log(`✅ Resolent incidència: ${incidentId}`);
      await updateDoc(doc(db, 'incidents', incidentId), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser.uid
      });
      console.log('✅ Incidència resolta');
    } catch (error) {
      console.error('❌ Error resolent incidència:', error);
    }
  };

  // Listener per usuaris connectats
  useEffect(() => {
    if (!currentUser) {
      setUsers([]);
      return;
    }

    console.log('👂 INICIANT LISTENER PER USUARIS...');
    
    const usersQuery = collection(db, 'userLocations');
    
    const unsubscribe = onSnapshot(usersQuery, async (snapshot) => {
      try {
        const usersData = await Promise.all(
          snapshot.docs.map(async (docSnap) => {
            const userData = docSnap.data();
            
            // Verificar si el mapa està disponible abans d'intentar crear marcadors
            if (mapInstanceRef?.current && userData.location) {
              try {
                // Crear o actualitzar marcador d'usuari si no existeix
                if (!userData.mapMarker) {
                  const L = window.L;
                  if (L && userData.location.latitude && userData.location.longitude) {
                    const marker = L.marker([userData.location.latitude, userData.location.longitude])
                      .addTo(mapInstanceRef.current)
                      .bindPopup(`👤 ${userData.displayName || 'Usuari'}`);
                    
                    // CORRECCIÓ: Assignar el marcador a l'objecte userData en lloc d'undefined
                    userData.mapMarker = marker;
                    console.log(`📍 Marcador creat per ${userData.displayName}`);
                  }
                } else {
                  // Actualitzar posició del marcador existent
                  if (userData.mapMarker && userData.location.latitude && userData.location.longitude) {
                    userData.mapMarker.setLatLng([userData.location.latitude, userData.location.longitude]);
                  }
                }
              } catch (markerError) {
                console.warn('⚠️ Error creant/actualitzant marcador:', markerError);
              }
            }
            
            return {
              id: docSnap.id,
              ...userData,
              // Filtrar propietats que no es poden serialitzar
              mapMarker: undefined
            };
          })
        );
        
        // Filtrar usuaris online i diferents de l'usuari actual
        const activeUsers = usersData.filter(user => 
          user.isOnline && 
          user.uid !== currentUser.uid &&
          user.lastUpdated // Assegurar que tenen timestamp recent
        );
        
        setUsers(activeUsers);
        console.log(`👥 ${activeUsers.length} usuaris actius trobats`);
        
      } catch (error) {
        console.error('Error processant usuari:', error);
      }
    }, (error) => {
      console.error('❌ Error listener usuaris:', error);
    });

    usersListenerRef.current = unsubscribe;
    
    return () => {
      if (usersListenerRef.current) {
        usersListenerRef.current();
        usersListenerRef.current = null;
      }
    };
  }, [currentUser, mapInstanceRef]);

  // Listener per incidències (només admins)
  useEffect(() => {
    if (!isAdmin) {
      setIncidents([]);
      return;
    }

    console.log('🚨 INICIANT LISTENER PER INCIDÈNCIES...');
    
    const incidentsQuery = query(
      collection(db, 'incidents'),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(incidentsQuery, (snapshot) => {
      try {
        const incidentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setIncidents(incidentsData);
        console.log(`🚨 ${incidentsData.length} incidències carregades`);
        
        // Notificar noves incidències no resoltes
        const newUnresolvedIncidents = incidentsData.filter(incident => 
          !incident.resolved && 
          incident.timestamp?.toDate?.() > new Date(Date.now() - 60000) // Últim minut
        );
        
        if (newUnresolvedIncidents.length > 0) {
          console.log(`🚨 ${newUnresolvedIncidents.length} noves incidències!`);
        }
        
      } catch (error) {
        console.error('❌ Error processant incidències:', error);
      }
    }, (error) => {
      console.error('❌ Error listener incidències:', error);
    });

    incidentsListenerRef.current = unsubscribe;
    
    return () => {
      if (incidentsListenerRef.current) {
        incidentsListenerRef.current();
        incidentsListenerRef.current = null;
      }
    };
  }, [isAdmin]);

  // Listener per rutes
  useEffect(() => {
    if (!currentUser) {
      setRoutes([]);
      return;
    }

    console.log('📚 INICIANT LISTENER PER RUTES...');
    
    const routesQuery = query(
      collection(db, 'routes'),
      where('deleted', '==', false),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      try {
        const routesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setRoutes(routesData);
        console.log(`📚 ${routesData.length} rutes carregades`);
        
      } catch (error) {
        console.error('❌ Error processant rutes:', error);
      }
    }, (error) => {
      console.error('❌ Error listener rutes:', error);
    });

    routesListenerRef.current = unsubscribe;
    
    return () => {
      if (routesListenerRef.current) {
        routesListenerRef.current();
        routesListenerRef.current = null;
      }
    };
  }, [currentUser]);

  // Carregar tots els usuaris si és super admin
  useEffect(() => {
    if (isSuperAdmin) {
      loadAllUsers();
    }
  }, [isSuperAdmin]);

  // Cleanup quan es desmunta el component
  useEffect(() => {
    return () => {
      // Netejar tots els listeners
      if (routesListenerRef.current) {
        routesListenerRef.current();
      }
      if (usersListenerRef.current) {
        usersListenerRef.current();
      }
      if (incidentsListenerRef.current) {
        incidentsListenerRef.current();
      }
    };
  }, []);

  return {
    routes,
    users,
    incidents,
    allUsers,
    loadAllUsers,
    makeUserAdmin,
    deleteRoute,
    resolveIncident
  };
};
