# Wielu użytkowników: założenia dla danych i logowania

Docelowo ETROM działa jako strona internetowa: każdy ma własne konto (login i hasło), a dane są wspólne dla biura. Obecna wersja zapisuje dane lokalnie w przeglądarce, ale model jest przygotowany tak, żeby przejście na serwer nie wymagało przebudowy ekranów.

## Co już jest gotowe pod serwer

- **Stabilne identyfikatory.** Projekty mają liczby całkowite, osoby `p-N`, zadania `t-N`, etapy własne `custom-N`, wpisy czasu `e-<czas><losowo>`. Wpis czasu dostaje identyfikator niezależnie od serwera, więc dwa urządzenia nie zderzą się numerami.
- **Czas pracy jako dopisywane rekordy** (`workspace.entries`), a nie liczniki w zadaniach. Dwie osoby zapisujące czas na tym samym zadaniu nie nadpisują się nawzajem. Każdy wpis ma `personId`, znaczniki czasu w UTC i `updatedAt`.
- **Wersjonowany zapis** (`WORKSPACE_VERSION`) z normalizacją przy odczycie: uszkodzone lub osierocone rekordy są pomijane.
- **Czyste funkcje w `src/core`** (bez DOM i przeglądarki): ta sama logika może działać po stronie serwera, np. do walidacji.

## Co zmieni się po wprowadzeniu logowania

- Preferencja „ja” (`prefs.me`, wybór osoby na ekranie *Moja praca*) zostanie zastąpiona tożsamością z sesji: zalogowany użytkownik jest osobą z katalogu zespołu.
- Zegar i zapis czasu będą przypisywane do zalogowanej osoby po stronie serwera; przeglądarka nie będzie mogła zapisać czasu cudzego konta.
- Uprawnienia (kto może zatwierdzać, edytować projekt, widzieć czas innych) przejdą z założeń interfejsu do reguł serwera. Dziś zatwierdzają lider i koordynator projektu.
- Dane z `localStorage` zostaną przeniesione do bazy; zapis lokalny zostanie jako podręczny bufor.

## Nierozstrzygnięte

- Gdzie działa serwer (własny serwer biura, NAS, chmura) — od tego zależy wybór bazy i sposobu synchronizacji.
- Czy czas innych osób jest jawny dla wszystkich, czy tylko dla lidera projektu i dyrekcji.
