import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAyHUDkgbJkgBjjnoQ_GXyHM_c-bcavRkY",
  authDomain: "rutatur-d5713.firebaseapp.com",
  projectId: "rutatur-d5713",
  storageBucket: "rutatur-d5713.firebasestorage.app",
  messagingSenderId: "928359956728",
  appId: "1:928359956728:web:36d40b1ff31a2120697b0d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Connect to emulators in development (optional)
if (process.env.NODE_ENV === 'development' && !auth._delegate._config.emulator) {
  try {
    connectAuthEmulator(auth, "http://localhost:9099");
    connectFirestoreEmulator(db, 'localhost', 8080);
  } catch (error) {
    console.log('Emulators already connected or not available');
  }
}

export default app;