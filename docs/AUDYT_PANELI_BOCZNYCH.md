# Audyt paneli bocznych (stan na 9.10.2026)

## Jak jest dziś

Wspólny wzorzec to **pasek przycisków po prawej** (`UI.railLayout`, makieta RL1): jeden przycisk na funkcję, ikona w kolorze funkcji, licznik, otwarty jeden panel naraz, ponowne kliknięcie zwija. Używają go Moja praca, Czas, Plan i (od teraz) Kalendarz. Projekty mają własną, starszą kopię tego wzorca (`pf-dock`). Reszta ekranów ma boczne treści „na sztywno” albo wcale.

| Ekran | Dziś | Ocena |
|---|---|---|
| Pulpit | prawa kolumna kart (`db-side`): Skrzynka, Stany wód, Zespół dziś, Finanse | to dashboard, nie panel; karty zostają, ale bez przycisków bocznych |
| Aktualności | stała prawa kolumna `fd__side`: Projekty w toku, Wyróżnienia, Zespół | **do przepięcia** na pasek (ikony: Projekty, Wyróżnienia, Zespół), domyślnie zwinięty |
| Skrzynka | pasek: Filtry (projekt, tylko pilne), Odłożone do jutra (licznik) | wzorzec (osobny ekran od 9.10.2026) |
| Zlecenia | brak panelu; formularz w szufladzie | **dodać** panel „Książka adresowa” dopiero gdy powstanie; teraz nic |
| Moja praca | pasek: Sprawy w toku, Zegar i projekty | wzorzec |
| Czas | pasek: panel czasu | wzorzec, ale tylko jedna funkcja |
| Plan | pasek: panel czasu (`time`) | wzorzec |
| Kalendarz | pasek: Filtry i warstwy, Wybrany dzień i terminy, Uwaga | wzorzec (wdrożone teraz) |
| Urlopy | brak; saldo i wnioski w treści | **dodać** pasek: Saldo i limity, Do akceptacji (licznik), Kto jest nieobecny dziś |
| Projekty (lista) | własny `pf-dock`: Najbliższe terminy | **ujednolicić** do `railLayout`, dodać drugi przycisk „Filtry listy” |
| Szczegóły projektu | inspektor (szuflada) | inna rola, zostaje |
| Przegląd | brak | **bez panelu** (jedna lista decyzji), nie dodawać |
| Analiza | brak panelu | do rozważenia pasek „Filtry i okres”, jeśli filtrów przybędzie |
| Zespół | brak | bez panelu |
| Biblioteka | brak | bez panelu |

## Proponowane zasady

1. Panel boczny to **dodatek do treści**, nie jej część: wszystko, co potrzebne do głównej pracy, jest w treści; panel to filtry, podgląd, kontekst.
2. Zawsze ten sam pasek po prawej, te same kolory funkcji: **niebieski/turkus** = filtry i kontekst, **fiolet** = dzień, kalendarz, terminy, **bursztyn** = uwaga i alarmy.
3. Jeden panel naraz, stan zapamiętany na urządzeniu per ekran.
4. Licznik na przycisku tylko gdy coś wymaga reakcji (bursztyn) albo filtr jest aktywny.
5. Ekran z jedną funkcją nie dostaje paska (np. Przegląd, Zespół, Biblioteka).
6. Na wąskich ekranach pasek przechodzi nad treść jako rząd ikon (już tak działa).

## Kolejność wdrożenia (propozycja)

1. Projekty: `pf-dock` → `railLayout` (usunięcie duplikatu kodu), plus przycisk Filtry.
2. Aktualności: stała kolumna → pasek (zrobione).
3. Skrzynka (osobny ekran, 9.10.2026): pasek z Filtrami i Odłożonymi (zrobione).
4. Urlopy: pasek Saldo / Do akceptacji / Nieobecni dziś.
5. Analiza: dopiero gdy pojawi się więcej filtrów.
6. Czas: sprawdzić, czy drugi przycisk (np. „Tydzień zespołu” dla Dyrekcji) ma sens.
