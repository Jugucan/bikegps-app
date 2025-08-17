// src/utils/debugHelper.js
// Utilitat per diagnosticar problemes amb Firebase i l'aplicació

import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../App';

export const debugHelper = {
  
  // Funció per verificar dades de Firebase
  async checkFirebaseData(currentUser) {
    console.log('🔍 === DEBUG HELPER - VERIFICANT DADES ===');
    
    if (!currentUser) {
      console.log('❌ No hi ha usuari autenticat');
      return;
    }

    console.log('👤 Usuari actual:', {
      uid: currentUser.uid,
      email: currentUser.email,
      displayName: currentUser.displayName
    });

    try {
      // 1. Verificar si l'usuari és admin
      const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
      console.log('👑 És admin?', adminDoc.exists());

      // 2. Verificar ubicacions d'usuaris
      const userLocationsSnapshot = await getDocs(collection(db, 'userLocations'));
      const userLocationsData = userLocationsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastUpdatedFormatted: doc.data().lastUpdated?.toDate?.()?.toLocaleString() || 'N/A'
      }));
      
      console.log('📍 Ubicacions d\'usuaris:', userLocationsData);
      console.log(`📊 Total usuaris amb ubicació: ${userLocationsData.length}`);
      console.log(`📊 Usuaris online: ${userLocationsData.filter(u => u.isOnline).length}`);

      // 3. Verificar rutes
      const routesSnapshot = await getDocs(collection(db, 'routes'));
      const routesData = routesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        deleted: doc.data().deleted,
        active: doc.data().active,
        createdBy: doc.data().createdBy,
        pointsCount: doc.data().pointsCount,
        createdAt: doc.data().createdAt?.toDate?.()?.toLocaleDateString() || 'N/A'
      }));

      console.log('🛤️ Rutes:', routesData);
      console.log(`📊 Total rutes: ${routesData.length}`);
      console.log(`📊 Rutes actives: ${routesData.filter(r => !r.deleted && r.active !== false).length}`);

      // 4. Verificar incidències (si és admin)
      if (adminDoc.exists()) {
        const incidentsSnapshot = await getDocs(collection(db, 'incidents'));
        const incidentsData = incidentsSnapshot.docs.map(doc => ({
          id: doc.id,
          message: doc.data().message,
          resolved: doc.data().resolved,
          userName: doc.data().userName,
          location: doc.data().location ? 'Sí' : 'No',
          timestamp: doc.data().timestamp?.toDate?.()?.toLocaleString() || 'N/A'
        }));

        console.log('🚨 Incidències:', incidentsData);
        console.log(`📊 Total incidències: ${incidentsData.length}`);
        console.log(`📊 Incidències per resoldre: ${incidentsData.filter(i => !i.resolved).length}`);
      }

      // 5. Verificar estructura de base de dades
      console.log('📋 Resum de col·leccions trobades:');
      console.log(`- userLocations: ${userLocationsSnapshot.size} documents`);
      console.log(`- routes: ${routesSnapshot.size} documents`);
      
      return {
        userLocations: userLocationsData,
        routes: routesData,
        isAdmin: adminDoc.exists()
      };

    } catch (error) {
      console.error('❌ Error verificant dades de Firebase:', error);
      
      // Informació adicional sobre l'error
      if (error.code === 'permission-denied') {
        console.log('🚫 Error de permisos - Comprova les regles de Firebase');
      } else if (error.code === 'not-found') {
        console.log('🔍 Document o col·lecció no trobada');
      }
      
      return null;
    }
  },

  // Funció per verificar geolocalització
  async checkGeolocation() {
    console.log('🌍 === VERIFICANT GEOLOCALITZACIÓ ===');
    
    if (!navigator.geolocation) {
      console.log('❌ Geolocalització no suportada');
      return false;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000
        });
      });

      const { latitude, longitude, accuracy, heading, speed } = position.coords;
      
      console.log('✅ Geolocalització funcionant:', {
        latitude,
        longitude,
        accuracy: `${accuracy}m`,
        heading: heading ? `${heading}°` : 'N/A',
        speed: speed ? `${speed * 3.6} km/h` : 'N/A',
        timestamp: new Date(position.timestamp).toLocaleString()
      });

      return true;
    } catch (error) {
      console.error('❌ Error amb geolocalització:', error);
      return false;
    }
  },

  // Funció per verificar conectivitat
  checkConnectivity() {
    console.log('🌐 === VERIFICANT CONNECTIVITAT ===');
    
    const online = navigator.onLine;
    console.log(`📡 Estat de xarxa: ${online ? 'Online' : 'Offline'}`);
    
    if ('connection' in navigator) {
      const connection = navigator.connection;
      console.log('📊 Informació de connexió:', {
        effectiveType: connection.effectiveType,
        downlink: connection.downlink + ' Mbps',
        rtt: connection.rtt + ' ms'
      });
    }

    return online;
  },

  // Funció per verificar rendiment del mapa
  checkMapPerformance(mapInstanceRef) {
    console.log('🗺️ === VERIFICANT RENDIMENT DEL MAPA ===');
    
    if (!mapInstanceRef?.current) {
      console.log('❌ Referència del mapa no trobada');
      return false;
    }

    const map = mapInstanceRef.current;
    
    console.log('✅ Mapa inicialitzat:', {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bounds: map.getBounds(),
      layersCount: Object.keys(map._layers).length
    });

    return true;
  },

  // Funció per executar tots els tests
  async runFullDiagnostic(currentUser, mapInstanceRef) {
    console.log('🚀 === DIAGNÒSTIC COMPLET ===');
    
    const results = {
      firebase: await this.checkFirebaseData(currentUser),
      geolocation: await this.checkGeolocation(),
      connectivity: this.checkConnectivity(),
      mapPerformance: this.checkMapPerformance(mapInstanceRef)
    };

    console.log('📊 === RESUM DEL DIAGNÒSTIC ===');
    console.log('Firebase:', results.firebase ? '✅' : '❌');
    console.log('Geolocalització:', results.geolocation ? '✅' : '❌');
    console.log('Connectivitat:', results.connectivity ? '✅' : '❌');
    console.log('Mapa:', results.mapPerformance ? '✅' : '❌');

    return results;
  }
};

// Instruccions d'ús:
// 1. Importa debugHelper al component principal
// 2. Executa debugHelper.runFullDiagnostic(currentUser, mapInstanceRef) quan vulguis fer debug
// 3. Revisa la consola per veure tota la informació de diagnòstic

export default debugHelper;
