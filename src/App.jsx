import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Importa els nous components de pàgina
import Dashboard from './components/dashboard/Dashboard.jsx';
import Programs from './components/programs/Programs.jsx';
import ProgramDetail from './components/programs/ProgramDetail.jsx';
import Schedule from './components/schedule/Schedule.jsx';
import Users from './components/users/Users.jsx';
import GymsAndHolidays from './components/gyms_holidays/GymsAndHolidays.jsx';
import Mixes from './components/mixes/Mixes.jsx';
import Settings from './components/settings/Settings.jsx';
import FixedScheduleManagement from './components/schedule/FixedScheduleManagement.jsx';
import RecurringSessions from './components/schedule/RecurringSessions.jsx';
import MonthlyReport from './components/reports/MonthlyReport.jsx';

// Importa els helpers i hooks
import useFirestoreData from './hooks/useFirestoreData.js';
import { MessageModal } from './components/common/MessageModal.jsx'; // Ensure MessageModal is exported correctly


function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [isFirebaseReady, setIsFirebaseReady] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Carregant dades...');
  
  const [dbInstance, setDbInstance] = useState(null);
  const [authInstance, setAuthInstance] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [appId, setAppId] = useState(null);

  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageModalContent, setMessageModalContent] = useState({ title: '', message: '', isConfirm: false, onConfirm: () => {}, onCancel: () => {} });

  // Initialize Firebase and set up authentication
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        const env = import.meta.env || {};
        console.log("VITE_FIREBASE_CONFIG:", env.VITE_FIREBASE_CONFIG);
        console.log("VITE_APP_ID:", env.VITE_APP_ID);

        const rawFirebaseConfig = env.VITE_FIREBASE_CONFIG;
        const envAppId = env.VITE_APP_ID || 'default-app-id';
        setAppId(envAppId);

        let firebaseConfig = {};
        if (rawFirebaseConfig) {
          try {
            firebaseConfig = JSON.parse(rawFirebaseConfig);
          } catch (e) {
            console.error("Error parsing VITE_FIREBASE_CONFIG:", e);
            setMessageModalContent({
              title: 'Error de Configuració',
              message: `Hi ha un problema amb la configuració de Firebase. Assegura't que VITE_FIREBASE_CONFIG és un JSON vàlid. Detalls: ${e.message}`,
              isConfirm: false,
              onConfirm: () => setShowMessageModal(false),
            });
            setShowMessageModal(true);
            setIsFirebaseReady(true);
            setLoadingMessage('Error de configuració de Firebase.');
            return;
          }
        }
        
        // If firebaseConfig is empty or invalid, proceed with dummy data
        if (Object.keys(firebaseConfig).length === 0 || !firebaseConfig.projectId) {
          console.warn("Firebase config not found or invalid. Using dummy data for local development.");
          setIsFirebaseReady(true);
          setLoadingMessage('Dades locals carregades (sense connexió a Firebase).');
          return;
        }

        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);

        setDbInstance(firestoreDb);
        setAuthInstance(firebaseAuth);

        const initialAuthToken = env.VITE_INITIAL_AUTH_TOKEN || null;

        if (initialAuthToken) {
          await signInWithCustomToken(firebaseAuth, initialAuthToken);
        } else {
          await signInAnonymously(firebaseAuth);
        }

        onAuthStateChanged(firebaseAuth, (user) => {
          if (user) {
            setCurrentUserId(user.uid);
          } else {
            console.log("No user signed in. Data will not be loaded from Firestore.");
            setLoadingMessage('No s\'ha pogut autenticar. Les dades no es desaran.');
          }
          setIsFirebaseReady(true); // Firebase auth state checked, ready to proceed
        });

      } catch (error) {
        console.error("Firebase initialization or auth error:", error);
        setLoadingMessage(`Error de càrrega: ${error.message}`);
        setIsFirebaseReady(true);
      }
    };

    initializeFirebase();
  }, []);

  // Use the custom hook to fetch and manage Firestore data
  const { programs, users, gyms, fixedSchedules, recurringSessions, scheduleOverrides, missedDays, setMissedDays, dataLoaded } = useFirestoreData(dbInstance, currentUserId, appId, isFirebaseReady, setLoadingMessage, setShowMessageModal, setMessageModalContent);

  useEffect(() => {
    if (isFirebaseReady && dataLoaded) {
      setLoadingMessage('Dades carregades amb èxit!');
    }
  }, [isFirebaseReady, dataLoaded]);


  const renderPage = () => {
    if (!isFirebaseReady || !dataLoaded) { // Wait for Firebase to be ready and data to be loaded
      return (
        <div className="flex justify-center items-center min-h-[calc(100vh-100px)]">
          <p className="text-xl text-gray-700">{loadingMessage}</p>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard programs={programs} users={users} gyms={gyms} scheduleOverrides={scheduleOverrides} fixedSchedules={fixedSchedules} recurringSessions={recurringSessions} missedDays={missedDays} db={dbInstance} currentUserId={currentUserId} appId={appId} setMissedDays={setMissedDays} />;
      case 'programs':
        return <Programs programs={programs} setCurrentPage={setCurrentPage} setSelectedProgramId={setSelectedProgramId} db={dbInstance} currentUserId={currentUserId} appId={appId} />;
      case 'programDetail':
        const program = programs.find(p => p.id === selectedProgramId);
        return <ProgramDetail program={program} setCurrentPage={setCurrentPage} db={dbInstance} currentUserId={currentUserId} appId={appId} />;
      case 'schedule':
        return <Schedule programs={programs} scheduleOverrides={scheduleOverrides} fixedSchedules={fixedSchedules} users={users} gyms={gyms} recurringSessions={recurringSessions} missedDays={missedDays} db={dbInstance} currentUserId={currentUserId} appId={appId} />;
      case 'users':
        return <Users users={users} gyms={gyms} db={dbInstance} currentUserId={currentUserId} appId={appId} />;
      case 'gymsAndHolidays':
        return <GymsAndHolidays gyms={gyms} db={dbInstance} currentUserId={currentUserId} appId={appId} />;
      case 'mixes':
        return <Mixes programs={programs} />;
      case 'settings':
        return <Settings setCurrentPage={setCurrentPage} />;
      case 'fixedScheduleManagement':
        return <FixedScheduleManagement fixedSchedules={fixedSchedules} programs={programs} gyms={gyms} db={dbInstance} currentUserId={currentUserId} appId={appId} />;
      case 'recurringSessions':
        return <RecurringSessions recurringSessions={recurringSessions} programs={programs} gyms={gyms} db={dbInstance} currentUserId={currentUserId} appId={appId} />;
      case 'monthlyReport':
        return <MonthlyReport programs={programs} gyms={gyms} fixedSchedules={fixedSchedules} recurringSessions={recurringSessions} scheduleOverrides={scheduleOverrides} missedDays={missedDays} />;
      default:
        return <Dashboard programs={programs} users={users} gyms={gyms} scheduleOverrides={scheduleOverrides} fixedSchedules={fixedSchedules} recurringSessions={recurringSessions} missedDays={missedDays} db={dbInstance} currentUserId={currentUserId} appId={appId} setMissedDays={setMissedDays} />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 font-inter">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <nav className="bg-gradient-to-r from-blue-600 to-blue-800 p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-white text-2xl font-bold">Gym Instructor</h1>
          {currentUserId && (
            <div className="text-white text-sm">
              ID d'usuari: <span className="font-mono text-blue-200">{currentUserId}</span>
            </div>
          )}
          <div className="space-x-4">
            <button onClick={() => setCurrentPage('dashboard')} className="text-white hover:text-blue-200 transition-colors duration-200 font-medium">Dashboard</button>
            <button onClick={() => setCurrentPage('programs')} className="text-white hover:text-blue-200 transition-colors duration-200 font-medium">Programes</button>
            <button onClick={() => setCurrentPage('schedule')} className="text-white hover:text-blue-200 transition-colors duration-200 font-medium">Calendari</button>
            <button onClick={() => setCurrentPage('users')} className="text-white hover:text-blue-200 transition-colors duration-200 font-medium">Usuaris</button>
            <button onClick={() => setCurrentPage('mixes')} className="text-white hover:text-blue-200 transition-colors duration-200 font-medium">Mixos</button>
            <button onClick={() => setCurrentPage('gymsAndHolidays')} className="text-white hover:text-blue-200 transition-colors duration-200 font-medium">Vacances</button>
            <button onClick={() => setCurrentPage('monthlyReport')} className="text-white hover:text-blue-200 transition-colors duration-200 font-medium">Informe Mensual</button>
            <button onClick={() => setCurrentPage('settings')} className="text-white hover:text-blue-200 transition-colors duration-200 font-medium">Configuració</button>
          </div>
        </div>
      </nav>

      <main className="flex-grow">
        {renderPage()}
      </main>

      <footer className="bg-gray-800 text-white p-4 text-center text-sm">
        <div className="container mx-auto">
          © 2025 Gym Instructor App. Tots els drets reservats.
        </div>
      </footer>

      {showMessageModal && (
        <MessageModal
          show={showMessageModal}
          title={messageModalContent.title}
          message={messageModalContent.message}
          onConfirm={messageModalContent.onConfirm}
          onCancel={messageModalContent.onCancel}
          isConfirm={messageModalContent.isConfirm}
        />
      )}
    </div>
  );
}

export default App;
