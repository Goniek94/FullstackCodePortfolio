Marketplace samochodowy — podsumowanie dla Klienta

Opis i status
Stworzyłem marketplace samochodowy całkowicie samodzielnie: od pierwszego kontaktu i zebrania wymagań, przez projekt architektury, implementację backendu, frontendu oraz zabezpieczeń, aż po pierwsze wdrożenie na serwery (VPS, NGINX, SSL, PM2). Projekt jest na ostatnim etapie wdrożenia — po pierwszym release — i jeszcze niedostępny publicznie z uwagi na finalne poprawki (stabilizacja, UX/SEO). Realizacja zajęła ok. 12 miesięcy. Ze względu na NDA pełne repozytoria nie są udostępniane; po uzgodnieniu z Klientem mogę pokazać wybrane fragmenty kodu.

Najważniejsze funkcjonalności

Ogłoszenia i wyszukiwarka: rozbudowane filtry (marka/model/rocznik/cena/lokalizacja itd.), karty wyników, szczegóły pojazdu; statystyki (wyświetlenia/ulubione), publikacja/odświeżanie/archiwizacja.

Formularz dodawania ogłoszeń: wieloetapowy, walidacje, podpowiedzi (marka/model/wersja), drag-and-drop zdjęć, podgląd, zapisy wersji roboczych.

Integracja z CEPIK: weryfikacja/uzupełnianie danych pojazdu (np. VIN/nr rejestracyjny), kontrola spójności i alerty niezgodności.

Integracja z płatnościami: moduł wyróżnień/opłat (statusy transakcji, historia, webhook-ready), spójny z procesem publikacji.

Dynamiczne pobieranie ogłoszeń: paginacja/infinite scroll, natychmiastowe odświeżanie wyników po zmianie filtrów (re-fetch), cache i UI optymistyczne.

Użytkownicy i bezpieczeństwo: rejestracja/logowanie, role/uprawnienia; uwierzytelnianie na cookies HttpOnly (access/refresh), walidacje, rate-limiting, sanitizacja XSS/NoSQL.

Komunikacja i powiadomienia: wiadomości między użytkownikami + powiadomienia w czasie rzeczywistym (Socket.IO, retry/offline).

Media: upload zdjęć z limitami i automatycznym przetwarzaniem (Sharp — kompresja/konwersja, miniatury).

Panel administracyjny (custom): autorskie widoki do moderacji ogłoszeń, zarządzania użytkownikami i przeglądu logów/raportów.

PWA i wydajność: service worker (tryb offline, „network-first” dla API), code-splitting, preload krytycznych zasobów, monitoring Core Web Vitals.

SEO/UX: meta OG/Twitter, JSON-LD, interfejs mobile-first (Tailwind/MUI), spójny mini-design-system.

Stos technologiczny

Frontend

React 18 (Create React App), TypeScript, React Router 6

Context API (Auth/Notification/Responsive), Axios z interceptorami (auto-refresh 401)

Socket.IO Client (real-time), Tailwind CSS, Material UI / Headless UI / Radix UI

Recharts (wykresy), Leaflet (mapy), React Toastify (powiadomienia)

PWA: manifest, service worker, cache krytycznych zasobów

Backend

Node.js (ESM), Express 4, MongoDB (Mongoose)

JWT w cookies HttpOnly (access/refresh, rotacja), middleware requireAuth

Socket.IO (powiadomienia/czat), Multer + Sharp (upload/przetwarzanie obrazów)

Bezpieczeństwo: Helmet, CORS, express-rate-limit, express-mongo-sanitize, walidacje (Joi/express-validator)

Cron (node-cron): archiwizacja wygasłych, cleanup zasobów

Integracje: CEPIK (weryfikacja danych), płatności (webhook-ready)

Infra/DevOps

VPS, NGINX (reverse-proxy + WebSocket upgrade), PM2, SSL

Konfiguracje środowisk .env, logowanie i podstawowy monitoring

Zakres mojej odpowiedzialności (end-to-end)

Analiza wymagań i plan → projekt architektury → implementacja backendu i frontendu → integracje (CEPIK, płatności, media, real-time) → warstwa bezpieczeństwa → konfiguracja serwera i pierwsze wdrożenie → stabilizacja (poprawki, debug, UX/SEO).

Wyselekcjonowane fragmenty kodu (do wglądu po uzgodnieniu — NDA)

Backend (Node.js)

scheduledTasks.js — procesy w tle (CRON): archiwizacja wygasłych ogłoszeń, czyszczenie zasobów (stabilność i higiena systemu).

adRoutes.js — endpoint /stats na MongoDB Aggregation Framework (zaawansowana analityka, poza CRUD).

AdSearchRoutes.js — logika sortowania z priorytetem ofert wyróżnionych (wymagania biznesowe → wydajne zapytania).

Frontend (React)

AuthContext.js — zarządzanie sesją i autoryzacją (Context API, cookies HttpOnly, odświeżanie tokenów).

App.js — struktura aplikacji, routing (w tym trasy chronione), code-splitting (React.lazy).

ListingDetails.js — złożony widok łączący wiele endpointów, stan i dynamiczny interfejs.
