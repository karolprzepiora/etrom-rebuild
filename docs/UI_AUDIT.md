# Audyt interfejsu ETROM — stan przed UI/UX Standard v1.0

Data: 2026-10-02. Przegląd zrzutów ekranu (jasny, ciemny, lista, panel, paleta, zadania, zespół) oraz kodu `styles/` i `src/ui/`.

## Najważniejsze wnioski

1. **Brak hierarchii nawigacji.** Lista projektów była jednocześnie ekranem szczegółów: rozwinięta karta projektu zajmowała całą szerokość, zawierała 14 etapów, a w nich zadania. Trzy poziomy informacji (portfel → projekt → etap → zadanie) były upchnięte w jednym przewijanym ekranie. Projekt nie miał własnego adresu, więc nie dało się do niego wrócić, wysłać linku ani użyć przycisku Wstecz.
2. **„Zupa z kart”.** Karty projektów z gradientową okładką, siatką kafelków liczbowych, paskiem 14 segmentów i rzędem przycisków. Każda karta krzyczała tak samo głośno; przy 20 projektach ekran byłby nieczytelny.
3. **Za dużo konkurujących akcji.** Pasek górny miał cztery równorzędne przyciski (Dane testowe, Pobierz kopię, Wczytaj kopię, Wyczyść), z czego jeden niszczący — stale widoczny, obok nawigacji. Akcje rzadkie i ryzykowne nie powinny stać na pierwszym planie.
4. **Pasek boczny dominuje.** Granatowa kolumna przyciągała wzrok bardziej niż treść. Zawierała trzy martwe pozycje „wkrótce” i blok ustawień (motyw, barwy) — ustawienia nie są nawigacją.
5. **Akcent mylony ze statusem.** Malinowy był jednocześnie kolorem głównego przycisku, aktywnej nawigacji, statusu „W realizacji” i „W toku”. Użytkownik nie mógł odróżnić „to jest klikalne” od „to jest stan”.
6. **Statusy tylko kolorem.** Plakietki statusów różniły się wyłącznie barwą tła — dla osób z zaburzeniami widzenia barw „W toku” i „Do zatwierdzenia” były nie do odróżnienia.
7. **Gęstość odwrotna do potrzeb.** Wiersze etapów miały ~56 px wysokości z pustą przestrzenią, a tabela projektów łamała kod („DEMO-↵002”). Jednocześnie filtry siedziały w osobnej, dużej karcie z etykietami WERSALIKAMI.

## Fundamenty — niespójności zmierzone w kodzie

| Obszar | Stan | Problem |
|---|---|---|
| Promienie | 8 różnych wartości (2, 5, 6, 7, 10, 16, 22 px, 50%, pill) | Brak systemu; 16–22 px na kartach to „miękki”, konsumencki styl, niepasujący do narzędzia pracy |
| Rozmiary tekstu | 9 wartości, nagłówek 36 px | Gigantyczny tytuł ekranu, za dużo poziomów pośrednich |
| Kolory | 28 kolorów zapisanych wprost w `app.css` poza tokenami | Brak jednego źródła prawdy |
| Cienie | 10 różnych deklaracji `box-shadow` | Brak poziomów elewacji |
| Gradienty | 6 (okładki, warstwice, tło paska) | Dekoracja zamiast informacji |
| Przyciski | 7 wariantów (`--danger`, `--solidDanger`, `--quiet`, `--ghost`…) | Część wariantów dubluje się, brak wariantu „tertiary” i stanów ładowania |
| Plakietki | 8 wariantów `chip--*`, w tym „na okładce” | Wariant zależny od miejsca, nie od znaczenia |
| Kontrolki | Selecty w kształcie pigułki obok prostokątnych pól | Różne wysokości (34, 38, 40 px) w jednym wierszu |

## Komponenty

- **Brak prymitywów:** Tooltip (tylko natywne `title`), Popover, Menu rozwijane, Zakładki, Szkielet ładowania, Przełącznik (switch), Nagłówek strony jako komponent.
- **Natywny `<select>` jako menu akcji** w wierszu zadania — nie pokazuje ikon statusów, nie da się go ostylować spójnie, wygląda jak pole formularza, a nie akcja.
- **Tabela:** sortowanie tylko w czterech kolumnach, bez zaznaczania wierszy, akcji zbiorczych, wyboru kolumn i stronicowania; nagłówek nieprzyklejony.
- **Formularze:** etykiety pól w trzech stylach (`.label` wersalikami, `.field__label`, etykieta przy checkboksie), brak oznaczenia pól wymaganych, przyciski formularza przewijały się razem z treścią.
- **Puste stany:** dwa warianty tekstowe, bez ikony i bez zawsze obecnej następnej czynności.

## Interakcje i dostępność

- Brak adresów URL dla widoków — Wstecz w przeglądarce nie działał.
- Akcje w wierszach (strzałki, usuń) były zawsze widoczne — szum przy 14 wierszach.
- Ikony bez opisu (strzałki etapu, X) polegały na `title`, którego nie widać przy obsłudze klawiaturą.
- Tekst `--ink-faint` (#87a0aa) na białym tle: kontrast 2,9:1 — poniżej WCAG AA dla zwykłego tekstu.
- Na wąskim ekranie pasek boczny po prostu znikał pod treścią; tabela przewijała się poziomo.

## Mikrocopy

- „Wyczyść” bez dopełnienia — nie wiadomo, co zostanie wyczyszczone.
- Stopka powtarzała długie ostrzeżenie o zapisie lokalnym na każdym ekranie.
- „Moduły oznaczone »wkrótce« są jeszcze w poprzedniej wersji aplikacji” — informacja dla twórcy, nie dla użytkownika.
- Mieszanie „Etapy i postęp” / „Ukryj etapy” / „Etapy” dla tej samej akcji.

## Decyzja

Przebudowa na nowym systemie, a nie łatanie: nowe tokeny, nowe prymitywy, nowy szkielet i nowa architektura informacji (lista → szczegóły projektu z zakładkami), przy zachowaniu całej logiki z `src/core` bez zmian w modelu danych. Szczegóły w [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
