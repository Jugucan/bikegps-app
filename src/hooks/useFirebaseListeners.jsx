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
  const userMarkersRef = useRef(new Map()); // Mapa per gestionar marcadors d'usuaris

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

  // Funció per gestionar marcadors d'usuaris
  const manageUserMarker = (userData) => {
    if (!mapInstanceRef?.current || !userData.location) return;
    
    const L = window.L;
    if (!L) return;

    const userId = userData.uid;
    const existingMarker = userMarkersRef.current.get(userId);

    if (existingMarker) {
      // Actualitzar posició del marcador existent
      existingMarker.setLatLng([userData.location.latitude, userData.location.longitude]);
      existingMarker.setPopupContent(`👤 ${userData.displayName || 'Usuari'} (Online)`);
    } else {
      // Crear nou marcador
      try {
        const marker = L.marker([userData.location.latitude, userData.location.longitude], {
          icon: L.divIcon({
            className: 'user-marker',
            html: `<div style="background: #4CAF50; border: 2px solid white; border-radius: 50%; width: 12px; height: 12px;"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          })
        })
          .addTo(mapInstanceRef.current)
          .bindPopup(`👤 ${userData.displayName || 'Usuari'} (Online)`);
        
        userMarkersRef.current.set(userId, marker);
        console.log(`📍 Marcador creat per ${userData.displayName || userData.uid}`);
      } catch (error) {
        console.warn('⚠️ Error creant marcador:', error);
      }
    }
  };

  // Funció per eliminar marcador d'usuari
  const removeUserMarker = (userId) => {
    const marker = userMarkersRef.current.get(userId);
    if (marker && mapInstanceRef?.current) {
      mapInstanceRef.current.removeLayer(marker);
      userMarkersRef.current.delete(userId);
      console.log(`🗑️ Marcador eliminat per usuari ${userId}`);
    }
  };

  // Listener per usuaris connectats
  useEffect(() => {
    if (!currentUser) {
      // Netejar marcadors quan no hi ha usuari
      userMarkersRef.current.forEach((marker, userId) => {
        if (mapInstanceRef?.current) {
          mapInstanceRef.current.removeLayer(marker);
        }
      });
      userMarkersRef.current.clear();
      setUsers([]);
      return;
    }

    console.log('👂 INICIANT LISTENER PER USUARIS...');
    
    const usersQuery = collection(db, 'userLocations');
    
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      try {
        const usersData = [];
        const currentActiveUserIds = new Set();

        snapshot.docs.forEach((docSnap) => {
          const userData = docSnap.data();
          
          // Verificar si l'usuari està online i no és l'usuari actual
          if (userData.isOnline && 
              userData.uid !== currentUser.uid && 
              userData.location &&
              userData.lastUpdated) {
            
            usersData.push({
              id: docSnap.id,
              ...userData
            });
            
            currentActiveUserIds.add(userData.uid);
            
            // Gestionar marcador d'usuari
            manageUserMarker(userData);
          }
        });

        // Eliminar marcadors d'usuaris que ja no estan actius
        userMarkersRef.current.forEach((marker, userId) => {
          if (!currentActiveUserIds.has(userId)) {
            removeUserMarker(userId);
          }
        });
        
        setUsers(usersData);
        console.log(`👥 ${usersData.length} usuaris actius trobats`);
        
      } catch (error) {
        console.error('❌ Error processant usuaris:', error);
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
        
        // Afegir marcadors d'incidències al mapa
        if (mapInstanceRef?.current && window.L) {
          incidentsData.forEach(incident => {
            if (incident.location && !incident.resolved) {
              try {
                const marker = window.L.marker([incident.location.latitude, incident.location.longitude], {
                  icon: window.L.divIcon({
                    className: 'incident-marker',
                    html: `<div style="background: #FF5722; border: 2px solid white; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px;">!</div>`,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8]
                  })
                })
                  .addTo(mapInstanceRef.current)
                  .bindPopup(`🚨 Incidència: ${incident.message}<br>📅 ${incident.timestamp?.toDate?.()?.toLocaleString()}`);
              } catch (error) {
                console.warn('⚠️ Error creant marcador incidència:', error);
              }
            }
          });
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
  }, [isAdmin, mapInstanceRef]);

  // Listener per rutes - SIMPLIFICAT per evitar l'error d'índex
  useEffect(() => {
    if (!currentUser) {
      setRoutes([]);
      return;
    }

    console.log('📚 INICIANT LISTENER PER RUTES...');
    
    // Query simplificat sense orderBy per evitar l'error d'índex
    const routesQuery = query(
      collection(db, 'routes'),
      where('deleted', '==', false)
    );
    
    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      try {
        let routesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Ordenar manualment per createdAt
        routesData = routesData.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toDate() - a.createdAt.toDate();
        });
        
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
      
      // Netejar marcadors d'usuaris
      if (mapInstanceRef?.current) {
        userMarkersRef.current.forEach((marker) => {
          mapInstanceRef.current.removeLayer(marker);
        });
      }
      userMarkersRef.current.clear();
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
