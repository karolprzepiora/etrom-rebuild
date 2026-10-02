# Dziennik korespondencji projektu (z AI) — projekt rozwiązania

Cel: użytkownik wrzuca pismo (PDF, skan, zdjęcie, e-mail, DOCX), a system sam
rozpoznaje, co to jest, zapisuje je w dzienniku poczty przychodzącej albo
wychodzącej projektu i wyciąga z niego terminy oraz zobowiązania.
Zasada nadrzędna: **AI proponuje, człowiek zatwierdza** — nic nie trafia do
dziennika ani do terminów bez jednego kliknięcia „Zapisz”.

## Dane (wpis dziennika)

`{ id, projectId, direction: 'in'|'out', number (znak pisma), letterDate, receivedOrSentDate,
   counterparty (nadawca/adresat: organ, instytucja), subject, summary (2–3 zdania),
   kind (decyzja, wezwanie, opinia, uzgodnienie, zawiadomienie, odpowiedź…),
   replyTo (id wpisu, na który odpowiada) , replyDue (termin odpowiedzi),
   deadlines: [{ date, what }], proceedingId (powiązane postępowanie), taskIds,
   files: [{ name, hash, pages }], extracted: { raw text, confidence per pole },
   status: 'draft'|'confirmed', createdBy, createdAt }`

Numer własny pism wychodzących: schemat konfigurowalny w biurze (np.
`ETROM/2026/DEMO-005/012`), nadawany przy zapisie, nie przez AI.

## Przepływ

1. **Wrzucenie** pliku na ekranie projektu (zakładka „Korespondencja”) albo
   przez adres e-mail projektu (przekazanie wiadomości).
2. **Odczyt tekstu**: PDF z warstwą tekstu bezpośrednio; skany i zdjęcia przez OCR.
3. **Ekstrakcja AI** do struktury powyżej (JSON o ustalonym schemacie), z oceną
   pewności każdego pola. Pola o niskiej pewności są wyróżnione do sprawdzenia.
4. **Podgląd do zatwierdzenia**: obok oryginału propozycja wpisu, terminów
   i zadań („Odpowiedź do 14 dni → dodać zadanie z terminem 16.10?”).
5. **Zapis**: wpis, plik oryginału (niezmienny, z sumą kontrolną), powiązania.
6. **Odpowiedź**: AI przygotowuje projekt pisma wychodzącego na podstawie
   wpisu, historii sprawy i szablonów biura; człowiek edytuje i wysyła;
   wysłane pismo wraca do dziennika jako wpis „wychodzący”.

## Co daje to reszcie aplikacji

- Terminy z pism zasilają **Najbliższą akcję** i oś terminów (np. „odpowiedź
  organowi do 16 paź”). Dotyczy to też terminów ustawowych postępowań
  (30/60 dni) — jedna nauka dla wszystkich modułów.
- Wyszukiwanie po treści i znaku sprawy; widok „oczekujemy na odpowiedź”.
- Historia sprawy w jednym miejscu: pismo ↔ zadania ↔ etap.

## Wymagania techniczne

- **Potrzebny serwer.** Klucz do modelu AI nie może być w przeglądarce, a pliki
  i dziennik muszą być wspólne dla zespołu. To wiąże się z decyzją o chmurze
  (docs/MULTIUSER.md): konta, uprawnienia, magazyn plików, kolejka zadań dla OCR i AI.
- Dane pism bywają poufne: umowa/DPA z dostawcą modelu, brak trenowania na
  danych, szyfrowanie plików, dziennik zdarzeń (kto zatwierdził wpis).
- Wersjonowanie ekstrakcji (jaki model i prompt) — możliwość ponownego odczytu.

## Etapy wdrożenia

1. **Dziennik ręczny** (bez AI) — *zrobione w zakresie bez załączników* (`src/core/mail.js`, `src/ui/mailTab.js`): model danych, lista, formularz, załączniki,
   numeracja, terminy odpowiedzi → zadania. Działa lokalnie, ten sam model później
   przejmie serwer.
2. **Ekstrakcja z potwierdzeniem** (po decyzji o serwerze): OCR + AI, podgląd,
   pewność pól, wykrywanie duplikatów.
3. **Projekty odpowiedzi**: szablony i pamięć biura, spójny styl pism.
4. **E-mail**: adres projektu, automatyczne przypisanie do projektu po znaku sprawy.

## Pytania otwarte (do decyzji)

- Gdzie przechowywać pliki (chmura biura, magazyn dostawcy)?
- Jaki jest dziś format znaku pism wychodzących?
- Czy dziennik ma obejmować tylko pisma „sprawy”, czy także wiadomości e-mail zespołu?
- Kto może zatwierdzać wpisy (autor, lider, wszyscy z zespołu)?


## Stan wdrożenia (faza 1)

- Wpis: `id (m-N)`, `projectId`, `direction (in|out)`, `regNo`, `kind`, `subject`, `counterparty`, `number` (znak), `registeredDate`, `letterDate`, `replyDue`, `noReply`, `replyTo`, `summary`, `where`, `createdBy/At`, `updatedAt`.
- Numer w dzienniku nadaje się sam, osobno dla projektu, kierunku i roku; nie zmienia się przy edycji (zmiana kierunku albo roku nadaje nowy; kierunku nie da się zmienić, gdy są już odpowiedzi).
- Pismo oczekuje na odpowiedź, dopóki nie powstanie pismo w przeciwnym kierunku wskazujące je w `replyTo`; stany: czeka / po terminie / odpowiedziano / bez odpowiedzi.
- AI wypełni ten sam formularz: propozycja pól → człowiek zatwierdza → ten sam `Mail.create`. `where` zastąpią załączniki po wdrożeniu serwera.
