import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../App';

const DebugTestingComponent = ({ currentUser, users, routes, incidents }) => {
  const [testResults, setTestResults] = useState({});
  const [isVisible, setIsVisible] = useState(false);

  // Test Firebase connectivity
  const testFirebaseConnection = async () => {
    try {
      const testDoc = await getDocs(collection(db, 'routes'));
      return {
        success: true,
        message: `✅ Firebase connectat - ${testDoc.size} documents trobats`
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Error Firebase: ${error.message}`
      };
    }
  };

  // Test user location simulation
  const testCreateFakeUser = async () => {
    if (!currentUser) return { success: false, message: '❌ No hi ha usuari autenticat' };
    
    try {
      // Crear usuari fals per testing
      const fakeUserId = `fake_${Date.now()}`;
      const fakeUserData = {
        uid: fakeUserId,
        displayName: `Test User ${Date.now()}`,
        email: `test${Date.now()}@example.com`,
        location: {
          latitude: 41.6722 + (Math.random() - 0.5) * 0.01, // Petita variació
          longitude: 2.4540 + (Math.random() - 0.5) * 0.01,
          accuracy: 10,
          heading: null
        },
        lastUpdated: serverTimestamp(),
        isOnline: true
      };

      await setDoc(doc(db, 'userLocations', fakeUserId), fakeUserData);
      
      return {
        success: true,
        message: `✅ Usuari de prova creat: ${fakeUserData.displayName}`
      };
    } catch (error) {
      return {
        success: false,
        message: `❌ Error creant usuari de prova: ${error.message}`
      };
    }
  };

  // Test current user location
  const testCurrentUserLocation = async () => {
    if (!navigator.geolocation) {
      return { success: false, message: '❌ Geolocation no suportat' };
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            success: true,
            message: `✅ Ubicació obtinguda: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
          });
        },
        (error) => {
          resolve({
            success: false,
            message: `❌ Error geolocation: ${error.message}`
          });
        },
        { timeout: 5000 }
      );
    });
  };

  // Run all tests
  const runAllTests = async () => {
    setTestResults({ testing: '⏳ Executant tests...' });
    
    const results = {};
    
    results.firebase = await testFirebaseConnection();
    results.location = await testCurrentUserLocation();
    results.fakeUser = await testCreateFakeUser();
    
    // Test data counts
    results.dataCounts = {
      success: true,
      message: `📊 Dades: ${routes?.length || 0} rutes, ${users?.length || 0} usuaris, ${incidents?.length || 0} incidències`
    };

    setTestResults(results);
  };

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-20 left-4 bg-yellow-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-yellow-700 z-50"
      >
        🔧 Debug Tests
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-95 text-white p-4 rounded-lg text-xs max-w-md z-50 font-mono">
      <div className="flex justify-between items-center mb-3">
        <div className="font-bold text-yellow-400">🔧 Debug Tests</div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2 mb-4">
        <div className="text-blue-300">Estat actual:</div>
        <div className="text-xs">
          <div>👤 Usuari: {currentUser?.email || 'No autenticat'}</div>
          <div>📍 Usuaris al mapa: {users?.length || 0}</div>
          <div>📚 Rutes carregades: {routes?.length || 0}</div>
          <div>🚨 Incidències: {incidents?.length || 0}</div>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <button
          onClick={runAllTests}
          className="w-full bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700"
        >
          🧪 Executar Tests
        </button>
      </div>

      {Object.keys(testResults).length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          <div className="font-bold text-green-300 mb-2">Resultats:</div>
          {Object.entries(testResults).map(([key, result]) => {
            if (typeof result === 'string') {
              return <div key={key} className="text-yellow-300">{result}</div>;
            }
            return (
              <div key={key} className={`text-xs ${result.success ? 'text-green-300' : 'text-red-300'}`}>
                <strong>{key}:</strong> {result.message}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-gray-600 mt-3 pt-2">
        <div className="text-xs text-gray-400">
          Consola del navegador per més detalls
        </div>
      </div>
    </div>
  );
};

export default DebugTestingComponent;
