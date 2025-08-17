import { useState, useEffect, useRef, useCallback } from 'react';
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
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { db } from '../App';

export const useFirebaseListeners = (currentUser, isAdmin, isSuperAdmin, mapInstanceRef) => {
  const [routes, setRoutes] = useState([]);
  const [users, setUsers] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Refs per evitar loops infinits - NO dependències en useEffect
  const routesListenerRef = useRef(null);
  const usersListenerRef = useRef(null);
  const incidentsListenerRef = useRef(null);
  
  // Refs per gestionar marcadors - SEPARATS del useEffect dependencies
  const userMarkersRef = useRef(new Map());
  const incidentMarkersRef = useRef(new Map());
  const markerLayerGroupRef = useRef(null);
  const mapReadyRef = useRef(false);

  console.log('🎯 useFirebaseListeners inicialitzat:', { 
    hasCurrentUser: !!currentUser, 
    isAdmin, 
    isSuperAdmin 
  });

  // FUNCIONS CALLBACK MEMOITZADES per evitar re-renders
  const initializeMarkerLayer = useCallback(() => {
    if (!mapInstanceRef?.current || markerLayerGroupRef.current || mapReadyRef.current) return;
    
    const L = window.L;
    if (!L) return;

    try {
      markerLayerGroupRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      mapReadyRef.current = true;
      console.log('📍 Layer group inicialitzat per marcadors');
    } catch (error) {
      console.warn('⚠️ Error inicialitzant layer group:', error);
    }
  }, []); // Sense dependències per evitar re-creació

  const clearAllMarkers = useCallback(() => {
    if (markerLayerGroupRef.current) {
      markerLayerGroupRef.current.clearLayers();
      userMarkersRef.current.clear();
      incidentMarkersRef.current.clear();
      console.log('🧹 Tots els marcadors netejats');
    }
  }, []);

  // Funcio per gestionar marcadors d'usuaris - MEMOITZADA
  const manageUserMarker = useCallback((userData) => {
    if (!mapReadyRef.current || !userData.location || !markerLayerGroupRef.current) return;
    
    const L = window.L;
    if (!L) return;

    const userId = userData.uid;
    let existingMarker = userMarkersRef.current.get(userId);

    // Si existeix, actualitzar posicio
    if (existingMarker) {
      existingMarker.setLatLng([userData.location.latitude, userData.location.longitude]);
      return;
    }

    // Crear nou marcador amb estil simple
    try {
      const marker = L.marker([userData.location.latitude, userData.location.longitude], {
        icon: L.divIcon({
          className: 'simple-user-marker',
          html: `
            <div style="
              width: 16px; 
              height: 16px; 
              background: #4CAF50; 
              border: 2px solid white; 
              border-radius: 50%; 
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            "></div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        })
      });

      marker.bindPopup(
        `👤 ${userData.displayName || userData.email || 'Usuari'}<br>` +
        `📍 Online`
      );

      markerLayerGroupRef.current.addLayer(marker);
      userMarkersRef.current.set(userId, marker);
      
      console.log(`📍 Marcador creat per ${userData.displayName || userData.email || userData.uid}`);
    } catch (error) {
      console.warn('⚠️ Error creant marcador usuari:', error);
    }
  }, []);

  // Funcio per gestionar marcadors d'incidencies - MEMOITZADA
  const manageIncidentMarkers = useCallback((incidentsData) => {
    if (!mapReadyRef.current || !markerLayerGroupRef.current) return;
    
    const L = window.L;
    if (!L) return;

    // Netejar marcadors d'incidencies anteriors
    incidentMarkersRef.current.forEach((marker, incidentId) => {
      markerLayerGroupRef.current.removeLayer(marker);
    });
    incidentMarkersRef.current.clear();

    // Afegir marcadors d'incidencies actives
    incidentsData.forEach(incident => {
      if (incident.location && !incident.resolved) {
        try {
          const marker = L.marker([incident.location.latitude, incident.location.longitude], {
            icon: L.divIcon({
              className: 'simple-incident-marker',
              html: `
                <div style="
                  width: 18px; 
                  height: 18px; 
                  background: #FF5722; 
                  border: 2px solid white; 
                  border-radius: 50%; 
                  display: flex; 
                  align-items: center; 
                  justify-content: center; 
                  font-size: 10px; 
                  color: white;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                ">⚠</div>
              `,
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            })
          });

          const timestamp = incident.timestamp?.toDate?.() || new Date();
          marker.bindPopup(
            `🚨 <strong>Incidencia</strong><br>` +
            `👤 ${incident.userName}<br>` +
            `💬 ${incident.message}<br>` +
            `📅 ${timestamp.toLocaleString()}`
          );

          markerLayerGroupRef.current.addLayer(marker);
          incidentMarkersRef.current.set(incident.id, marker);
        } catch (error) {
          console.warn('⚠️ Error creant marcador incidencia:', error);
        }
      }
    });

    console.log(`🚨 ${incidentMarkersRef.current.size} marcadors d'incidencies actualitzats`);
  }, []);

  // Funcio per refrescar dades - MEMOITZADA
  const refreshData = useCallback(async () => {
    console.log('🔄 Forçant refresh manual de dades...');
    setLoading(true);
    
    try {
      // Refrescar rutes
      console.log('📚 Refrescant rutes...');
      const routesSnapshot = await getDocs(
        query(collection(db, 'routes'), where('deleted', '==', false), limit(50))
      );
      const routesData = routesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        active: doc.data().active !== false
      }));
      
      // Ordenar manualment per createdAt
      routesData.sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toDate() - a.createdAt.toDate();
      });
      
      setRoutes(routesData);
      console.log(`📚 ${routesData.length} rutes refrescades manualment`);

      // Refrescar usuaris si hi ha currentUser
      if (currentUser) {
        console.log('👥 Refrescant usuaris...');
        const userLocationsSnapshot = await getDocs(collection(db, 'userLocations'));
        const usersData = [];
        
        userLocationsSnapshot.docs.forEach((docSnap) => {
          const userData = docSnap.data();
          
          if (userData.isOnline && 
              userData.uid !== currentUser.uid && 
              userData.location &&
              userData.lastUpdated) {
            
            const lastUpdate = userData.lastUpdated.toDate();
            const now = new Date();
            const diffMinutes = (now - lastUpdate) / (1000 * 60);
            
            if (diffMinutes <= 15) { // Més generous per debug
              usersData.push({
                id: docSnap.id,
                ...userData
              });
            }
          }
        });
        
        setUsers(usersData);
        console.log(`👥 ${usersData.length} usuaris refrescats manualment`);
      }

      // Refrescar incidències
      console.log('🚨 Refrescant incidències...');
      const incidentsSnapshot = await getDocs(collection(db, 'incidents'));
      let incidentsData = incidentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenar manualment per timestamp
      incidentsData = incidentsData.sort((a, b) => {
        if (!a.timestamp || !b.timestamp) return 0;
        return b.timestamp.toDate() - a.timestamp.toDate();
      });
      
      setIncidents(incidentsData);
      console.log(`🚨 ${incidentsData.length} incidències refrescades manualment`);
      
      setError(null);
    } catch (error) {
      console.error('❌ Error en refresh manual:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]); // Només depèn de l'UID

  // Altres funcions MEMOITZADES
  const loadAllUsers = useCallback(async () => {
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
      setError(error.message);
    }
  }, [isSuperAdmin]);

  const makeUserAdmin = useCallback(async (userId) => {
    if (!isSuperAdmin || !currentUser) return;
    
    try {
      console.log(`👑 Fent admin a l'usuari: ${userId}`);
      await setDoc(doc(db, 'admins', userId), {
        uid: userId,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp()
      });
      
      await updateDoc(doc(db, 'users', userId), {
        isAdmin: true,
        updatedAt: serverTimestamp()
      });
      
      console.log('✅ Usuari fet admin correctament');
      loadAllUsers();
    } catch (error) {
      console.error('❌ Error fent admin:', error);
      setError(error.message);
    }
  }, [isSuperAdmin, currentUser?.uid, loadAllUsers]);

  const deleteRoute = useCallback(async (routeId) => {
    if (!isAdmin || !currentUser) return;
    
    try {
      console.log(`🗑️ Eliminant ruta: ${routeId}`);
      await updateDoc(doc(db, 'routes', routeId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: currentUser.uid
      });
      console.log('✅ Ruta eliminada correctament');
      
      setRoutes(prevRoutes => prevRoutes.filter(route => route.id !== routeId));
    } catch (error) {
      console.error('❌ Error eliminant ruta:', error);
      setError(error.message);
    }
  }, [isAdmin, currentUser?.uid]);

  const resolveIncident = useCallback(async (incidentId) => {
    if (!isAdmin || !currentUser) return;
    
    try {
      console.log(`✅ Resolent incidencia: ${incidentId}`);
      await updateDoc(doc(db, 'incidents', incidentId), {
        resolved: true,
        resolvedAt: serverTimestamp(),
        resolvedBy: currentUser.uid
      });
      console.log('✅ Incidencia resolta');
      
      setIncidents(prevIncidents => 
        prevIncidents.map(incident => 
          incident.id === incidentId 
            ? { ...incident, resolved: true, resolvedAt: new Date(), resolvedBy: currentUser.uid }
            : incident
        )
      );
    } catch (error) {
      console.error('❌ Error resolent incidencia:', error);
      setError(error.message);
    }
  }, [isAdmin, currentUser?.uid]);

  // Efecte per inicialitzar marcadors quan el mapa estigui llest
  useEffect(() => {
    if (mapInstanceRef?.current && !mapReadyRef.current) {
      const timer = setTimeout(() => {
        initializeMarkerLayer();
      }, 1000); // Donar més temps
      
      return () => clearTimeout(timer);
    }
  }, []); // SENSE dependències per evitar re-renders

  // Efecte SEPARAT per actualitzar marcadors quan hi hagi dades
  useEffect(() => {
    if (mapReadyRef.current && users.length > 0) {
      users.forEach(userData => {
        manageUserMarker(userData);
      });
    }
  }, [users, manageUserMarker]);

  useEffect(() => {
    if (mapReadyRef.current && incidents.length > 0) {
      manageIncidentMarkers(incidents);
    }
  }, [incidents, manageIncidentMarkers]);

  // Listener per rutes - SENSE dependencies problemàtiques
  useEffect(() => {
    console.log('📚 Iniciant listener per rutes...');
    setLoading(true);
    
    const routesQuery = query(
      collection(db, 'routes'),
      where('deleted', '==', false),
      limit(100)
    );
    
    const unsubscribe = onSnapshot(routesQuery, (snapshot) => {
      try {
        let routesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          active: doc.data().active !== false
        }));
        
        routesData = routesData.sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toDate() - a.createdAt.toDate();
        });
        
        setRoutes(routesData);
        console.log(`📚 ${routesData.length} rutes carregades via listener`);
        
        if (!currentUser) {
          setLoading(false);
        }
        
      } catch (error) {
        console.error('❌ Error processant rutes:', error);
        setError(error.message);
        setLoading(false);
      }
    }, (error) => {
      console.error('❌ Error listener rutes:', error);
      setError(error.message);
      setLoading(false);
    });

    routesListenerRef.current = unsubscribe;
    
    return () => {
      if (routesListenerRef.current) {
        routesListenerRef.current();
        routesListenerRef.current = null;
      }
    };
  }, []); // SENSE dependencies

  // Listener per usuaris - NOMÉS DEPÈN DE currentUser.uid
  useEffect(() => {
    if (!currentUser) {
      clearAllMarkers();
      setUsers([]);
      return;
    }

    console.log('👥 Iniciant listener per usuaris...');
    
    // QUERY SIMPLE sense where isOnline per veure tots
    const usersQuery = query(
      collection(db, 'userLocations'),
      limit(50)
    );
    
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      try {
        const usersData = [];

        snapshot.docs.forEach((docSnap) => {
          const userData = docSnap.data();
          
          console.log('👤 Usuari trobat:', {
            uid: userData.uid,
            isOnline: userData.isOnline,
            hasLocation: !!userData.location,
            lastUpdated: userData.lastUpdated?.toDate?.()
          });
          
          if (userData.uid !== currentUser.uid && userData.location) {
            
            // MENYS RESTRICTIU - acceptar usuaris encara que no estiguin "perfectament" online
            if (userData.lastUpdated) {
              const lastUpdate = userData.lastUpdated.toDate();
              const now = new Date();
              const diffMinutes = (now - lastUpdate) / (1000 * 60);
              
              if (diffMinutes <= 30) { // MOLT més generous
                usersData.push({
                  id: docSnap.id,
                  ...userData
                });
              }
            } else {
              // Si no té lastUpdated però té location, afegir-lo igualment
              usersData.push({
                id: docSnap.id,
                ...userData
              });
            }
          }
        });
        
        setUsers(usersData);
        console.log(`👥 ${usersData.length} usuaris actius via listener`);
        
        setLoading(false);
        
      } catch (error) {
        console.error('❌ Error processant usuaris:', error);
        setError(error.message);
        setLoading(false);
      }
    }, (error) => {
      console.error('❌ Error listener usuaris:', error);
      setError(error.message);
      setLoading(false);
    });

    usersListenerRef.current = unsubscribe;
    
    return () => {
      if (usersListenerRef.current) {
        usersListenerRef.current();
        usersListenerRef.current = null;
      }
    };
  }, [currentUser?.uid]); // Només l'UID

  // Listener per incidencies - NOMÉS DEPÈN DE currentUser.uid
  useEffect(() => {
    if (!currentUser) {
      setIncidents([]);
      return;
    }

    console.log('🚨 Iniciant listener per incidencies...');
    
    const incidentsQuery = query(
      collection(db, 'incidents'),
      limit(50)
    );
    
    const unsubscribe = onSnapshot(incidentsQuery, (snapshot) => {
      try {
        let incidentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        incidentsData = incidentsData.sort((a, b) => {
          if (!a.timestamp || !b.timestamp) return 0;
          return b.timestamp.toDate() - a.timestamp.toDate();
        });
        
        setIncidents(incidentsData);
        console.log(`🚨 ${incidentsData.length} incidencies carregades via listener`);
        
      } catch (error) {
        console.error('❌ Error processant incidencies:', error);
        setError(error.message);
      }
    }, (error) => {
      console.error('❌ Error listener incidencies:', error);
      setError(error.message);
    });

    incidentsListenerRef.current = unsubscribe;
    
    return () => {
      if (incidentsListenerRef.current) {
        incidentsListenerRef.current();
        incidentsListenerRef.current = null;
      }
    };
  }, [currentUser?.uid]); // Només l'UID

  // Carregar tots els usuaris si es super admin
  useEffect(() => {
    if (isSuperAdmin && currentUser) {
      loadAllUsers();
    }
  }, [isSuperAdmin, currentUser?.uid, loadAllUsers]);

  // Cleanup quan es desmunta el component
  useEffect(() => {
    return () => {
      console.log('🧹 Netejant listeners de Firebase...');
      if (routesListenerRef.current) routesListenerRef.current();
      if (usersListenerRef.current) usersListenerRef.current();
      if (incidentsListenerRef.current) incidentsListenerRef.current();
      clearAllMarkers();
    };
  }, [clearAllMarkers]);

  // Log d'estat per debug - OPTIMITZAT
  useEffect(() => {
    console.log('📊 useFirebaseListeners estat:', {
      routes: routes.length,
      users: users.length,
      incidents: incidents.length,
      allUsers: allUsers.length,
      loading,
      error,
      mapReady: mapReadyRef.current
    });
  }, [routes.length, users.length, incidents.length, allUsers.length, loading, error]);

  return {
    routes,
    users,
    incidents,
    allUsers,
    loading,
    error,
    loadAllUsers,
    makeUserAdmin,
    deleteRoute,
    resolveIncident,
    refreshData
  };
};
