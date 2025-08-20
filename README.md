Car Marketplace
Overview & Status

I built a car marketplace end-to-end and single-handedly: from first client contact and requirements gathering, through architecture design, backend/frontend implementation and security, to the first server deployment (VPS, NGINX, SSL, PM2). The project is in the final rollout stage — after the first release — and is not yet publicly available due to final fixes (stabilization, UX/SEO). Total delivery time: ~12 months. Due to NDA, full repositories are not shared; selected code snippets can be shown upon agreement with the client.

Key Features

Listings & search: advanced filters (make/model/year/price/location, etc.), results cards, vehicle details; statistics (views/favorites), publish/refresh/archive flows.

Listing form: multi-step, validations, suggestions (make/model/version), drag-and-drop images, preview, draft saving.

CEPIK integration: vehicle data verification/enrichment (e.g., VIN/registration no.), consistency checks and mismatch alerts.

Payments integration: featured/promoted listings, transaction statuses & history, webhook-ready, aligned with the publish flow.

Dynamic data loading: pagination/infinite scroll, instant re-fetch on filter change, caching and optimistic UI.

Users & security: sign-up/sign-in, roles/permissions; HttpOnly cookies (access/refresh), validations, rate-limiting, XSS/NoSQL sanitization.

Messaging & notifications: user-to-user messages + real-time notifications (Socket.IO, retry/offline).

Media: image upload with limits and automatic processing (Sharp — compression/conversion, thumbnails).

Custom admin panel: bespoke views for listing moderation, user management, logs/reports.

PWA & performance: service worker (offline, network-first for API), code-splitting, critical resource preload, Core Web Vitals monitoring.

SEO/UX: Open Graph / Twitter Cards, JSON-LD, mobile-first UI (Tailwind/MUI), a consistent mini design system.

Tech Stack
Frontend

React 18 (Create React App), TypeScript, React Router 6

Context API (Auth/Notification/Responsive), Axios with interceptors (auto-refresh on 401)

Socket.IO Client (real-time), Tailwind CSS, Material UI / Headless UI / Radix UI

Recharts (charts), Leaflet (maps), React Toastify (notifications)

PWA: manifest, service worker, critical asset caching

Backend

Node.js (ESM), Express 4, MongoDB (Mongoose)

JWT in HttpOnly cookies (access/refresh, rotation), requireAuth middleware

Socket.IO (notifications/chat), Multer + Sharp (upload/image processing)

Security: Helmet, CORS, express-rate-limit, express-mongo-sanitize, validations (Joi/express-validator)

Cron (node-cron): expired-listing archiving, resource cleanup

Integrations: CEPIK (vehicle verification), payments (webhook-ready)

Infra/DevOps

VPS, NGINX (reverse proxy + WebSocket upgrade), PM2, SSL

.env environment configuration, logging and basic monitoring

Scope of Responsibility (end-to-end)

Requirements & planning → architecture design → backend & frontend implementation → integrations (CEPIK, payments, media, real-time) → security layer → server configuration & first deployment → stabilization (bugfixes, UX/SEO).

Selected Code Snippets (available upon request — NDA)

Backend (Node.js)

scheduledTasks.js — background jobs (CRON): expiring-listing notifications, auto-archiving, resource cleanup (system stability & hygiene).

adRoutes.js — /stats endpoint using MongoDB Aggregation Framework (analytics beyond CRUD).

AdSearchRoutes.js — sorting logic prioritizing featured listings (business rules → efficient queries).

Frontend (React)

AuthContext.js — session/auth management (Context API, HttpOnly cookies, token refresh).

App.js — app structure, routing (incl. protected routes), code-splitting (React.lazy).

ListingDetails.js — complex detail view combining multiple endpoints, state management and dynamic UI.




PL VERSION

Marketplace samochodowy

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
