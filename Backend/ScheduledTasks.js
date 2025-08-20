import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import Ad from '../models/ad.js';
import notificationService from '../controllers/notifications/notificationController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Funkcja sprawdzająca ogłoszenia z kończącym się terminem ważności
 * i wysyłająca powiadomienia do użytkowników
 */
const checkExpiringAds = async () => {
  try {
    console.log('Uruchomiono zadanie sprawdzania ogłoszeń z kończącym się terminem ważności');
    
    // Pobierz aktualną datę
    const now = new Date();
    
    // Oblicz datę za 3 dni
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(now.getDate() + 3);
    
    // Znajdź ogłoszenia, które wygasają w ciągu najbliższych 3 dni
    // Zakładamy, że ogłoszenia mają pole expiresAt, które określa datę wygaśnięcia
    const expiringAds = await Ad.find({
      status: 'active',
      expiresAt: {
        $gte: now,
        $lte: threeDaysFromNow
      },
      // Pole notifiedAboutExpiration pozwala uniknąć wielokrotnego powiadamiania o tym samym ogłoszeniu
      notifiedAboutExpiration: { $ne: true }
    }).populate('owner', 'role'); // Pobieramy rolę właściciela
    
    console.log(`Znaleziono ${expiringAds.length} ogłoszeń z kończącym się terminem ważności`);
    
    // Dla każdego ogłoszenia wyślij powiadomienie do właściciela
    for (const ad of expiringAds) {
      try {
        // Sprawdź, czy właściciel ogłoszenia jest administratorem
        const isAdminAd = ad.owner && ad.owner.role === 'admin';
        
        if (isAdminAd) {
          console.log(`Pomijam powiadomienie dla ogłoszenia (ID: ${ad._id}) - właściciel jest administratorem`);
          continue; // Pomijamy ogłoszenia administratorów
        }
        
        // Oblicz liczbę dni do wygaśnięcia
        const daysLeft = Math.ceil((ad.expiresAt - now) / (1000 * 60 * 60 * 24));
        
        // Tytuł ogłoszenia
        const adTitle = ad.headline || `${ad.brand} ${ad.model}`;
        
        // Wyślij powiadomienie
        await notificationService.notifyAdExpiringSoon(ad.owner._id, adTitle, daysLeft);
        
        // Oznacz ogłoszenie jako powiadomione
        ad.notifiedAboutExpiration = true;
        await ad.save();
        
        console.log(`Wysłano powiadomienie o kończącym się terminie ogłoszenia ${ad._id} do użytkownika ${ad.owner._id}`);
      } catch (error) {
        console.error(`Błąd podczas wysyłania powiadomienia dla ogłoszenia ${ad._id}:`, error);
      }
    }
  } catch (error) {
    console.error('Błąd podczas sprawdzania ogłoszeń z kończącym się terminem:', error);
  }
};

/**
 * Funkcja sprawdzająca ogłoszenia, które wygasły i zmieniająca ich status na "archiwalne"
 */
const archiveExpiredAds = async () => {
  try {
    console.log('Uruchomiono zadanie archiwizacji wygasłych ogłoszeń');
    
    // Pobierz aktualną datę
    const now = new Date();
    
    // Znajdź ogłoszenia, które wygasły
    const expiredAds = await Ad.find({
      status: 'active',
      expiresAt: { $lt: now }
    }).populate('owner', 'role'); // Pobieramy rolę właściciela
    
    console.log(`Znaleziono ${expiredAds.length} wygasłych ogłoszeń do archiwizacji`);
    
    // Dla każdego ogłoszenia zmień status na "archiwalne" i wyślij powiadomienie
    for (const ad of expiredAds) {
      try {
        // Sprawdź, czy właściciel ogłoszenia jest administratorem
        const isAdminAd = ad.owner && ad.owner.role === 'admin';
        
        if (isAdminAd) {
          console.log(`Pomijam archiwizację ogłoszenia (ID: ${ad._id}) - właściciel jest administratorem`);
          continue; // Pomijamy ogłoszenia administratorów
        }
        
        // Zmień status na "archived"
        ad.status = 'archived';
        await ad.save();
        
        // Tytuł ogłoszenia
        const adTitle = ad.headline || `${ad.brand} ${ad.model}`;
        
        // Wyślij powiadomienie o wygaśnięciu ogłoszenia
        await notificationService.notifyAdExpired(ad.owner._id, adTitle, ad._id.toString());
        
        // Wyślij również powiadomienie o zmianie statusu
        await notificationService.notifyAdStatusChange(ad.owner._id, adTitle, 'archived');
        
        console.log(`Zarchiwizowano ogłoszenie ${ad._id} i wysłano powiadomienie do użytkownika ${ad.owner._id}`);
      } catch (error) {
        console.error(`Błąd podczas archiwizacji ogłoszenia ${ad._id}:`, error);
      }
    }
  } catch (error) {
    console.error('Błąd podczas archiwizacji wygasłych ogłoszeń:', error);
  }
};

/**
 * Funkcja czyszcząca tymczasowe pliki obrazów
 * Usuwa pliki tymczasowe starsze niż określony czas
 */
const cleanupImageCache = async () => {
  try {
    console.log('Uruchomiono zadanie czyszczenia pamięci podręcznej obrazów');
    
    // Katalog z tymczasowymi plikami obrazów
    const tempDir = path.join(process.cwd(), 'temp');
    
    // Sprawdź, czy katalog istnieje
    if (!fs.existsSync(tempDir)) {
      console.log('Katalog temp nie istnieje, tworzenie...');
      fs.mkdirSync(tempDir, { recursive: true });
      return;
    }
    
    // Pobierz listę plików w katalogu
    const files = fs.readdirSync(tempDir);
    
    // Aktualna data
    const now = Date.now();
    
    // Maksymalny wiek pliku (24 godziny w milisekundach)
    const maxAge = 24 * 60 * 60 * 1000;
    
    let removedCount = 0;
    
    // Dla każdego pliku sprawdź jego wiek
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      
      try {
        // Pobierz statystyki pliku
        const stats = fs.statSync(filePath);
        
        // Oblicz wiek pliku
        const fileAge = now - stats.mtimeMs;
        
        // Jeśli plik jest starszy niż maksymalny wiek, usuń go
        if (fileAge > maxAge) {
          fs.unlinkSync(filePath);
          removedCount++;
        }
      } catch (error) {
        console.error(`Błąd podczas przetwarzania pliku ${filePath}:`, error);
      }
    }
    
    console.log(`Usunięto ${removedCount} tymczasowych plików obrazów`);
  } catch (error) {
    console.error('Błąd podczas czyszczenia pamięci podręcznej obrazów:', error);
  }
};

/**
 * Funkcja uruchamiająca skrypt optymalizacji obrazów
 */
const runImageOptimization = () => {
  try {
    console.log('Uruchomiono zadanie optymalizacji obrazów');
    
    // Ścieżka do skryptu optymalizacji obrazów
    const scriptPath = path.join(__dirname, 'optimizeImages.js');
    
    // Uruchom skrypt jako proces Node.js
    exec(`node ${scriptPath}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Błąd podczas uruchamiania skryptu optymalizacji obrazów: ${error.message}`);
        return;
      }
      
      if (stderr) {
        console.error(`Błędy ze skryptu optymalizacji obrazów: ${stderr}`);
      }
      
      console.log(`Wynik optymalizacji obrazów: ${stdout}`);
    });
  } catch (error) {
    console.error('Błąd podczas uruchamiania optymalizacji obrazów:', error);
  }
};

/**
 * Inicjalizacja zadań cyklicznych
 */
export const initScheduledTasks = () => {
  // Sprawdzaj ogłoszenia z kończącym się terminem ważności codziennie o 8:00
  cron.schedule('0 8 * * *', checkExpiringAds);
  
  // Archiwizuj wygasłe ogłoszenia codziennie o 0:00
  cron.schedule('0 0 * * *', archiveExpiredAds);
  
  // Czyść pamięć podręczną obrazów co 12 godzin
  cron.schedule('0 */12 * * *', cleanupImageCache);
  
  // Optymalizuj obrazy co tydzień w niedzielę o 3:00 w nocy
  cron.schedule('0 3 * * 0', runImageOptimization);
  
  console.log('Zainicjalizowano zadania cykliczne');
};
