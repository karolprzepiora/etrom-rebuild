# ETROM — UI/UX Standard v1.0

Obowiązujący standard interfejsu ETROM. Każdy nowy ekran i każda nowa funkcja
korzysta z tych tokenów i komponentów. Odstępstwo wymaga zmiany tego dokumentu,
a nie lokalnego wyjątku w CSS.

Kolejność priorytetów przy każdej decyzji:
**czytelność → intuicyjność → szybkość pracy → hierarchia → spójność → dostępność → estetyka → wrażenie premium.**
Estetyka nigdy nie wygrywa z pierwszymi sześcioma.

## 1. Kierunek wizualny: „spokojna precyzja”

Narzędzie pracy biura projektowego, w którym spędza się cały dzień. Dlatego:

- **Treść jest bohaterem.** Chrom aplikacji (panel boczny, pasek górny) jest jasny,
  płaski i cichy. Kolor pojawia się tam, gdzie niesie informację.
- **Jeden akcent, użyty oszczędnie.** Akcent oznacza *interakcję i bieżące miejsce*
  (główny przycisk, fokus, aktywna zakładka, zaznaczenie). **Nigdy stan.**
- **Stan ma własny język:** ikona o kształcie stanu + nazwa + barwa semantyczna.
  Kształt wystarcza, gdy kolor nie jest widoczny.
- **Gęstość zamiast kart.** Tabele, wiersze i listy z cienkimi podziałami.
  Karta jest kontenerem, nie dekoracją.
- **Bez gradientów, szkła i dużych cieni.** Elewację buduje obrys + subtelny cień.
- **Ruch tłumaczy zmianę** (skąd przyszło, co się zmieniło) i trwa 80–260 ms.

## 2. Fundamenty — `styles/tokens.css`

Jedyne miejsce z wartościami. Każdy kolor ma postać `light-dark(jasny, ciemny)`,
więc motyw ciemny nie jest osobnym arkuszem — jest drugą połową tej samej deklaracji.
Motyw wybiera `color-scheme` (`data-theme="light|dark"` albo ustawienie systemu).

### Kolor — role semantyczne

| Rola | Token | Zastosowanie |
|---|---|---|
| Tło aplikacji | `--bg-canvas` | panel boczny, tło za treścią |
| Powierzchnia | `--bg-surface` | treść strony, tabele, karty |
| Powierzchnia uniesiona | `--bg-raised` | menu, okna, panel boczny formularza |
| Powierzchnia wtórna | `--bg-subtle` | nagłówek tabeli, rozwinięty wiersz |
| Najechanie / wciśnięcie / zaznaczenie | `--bg-hover`, `--bg-pressed`, `--bg-selected` | stany interakcji |
| Odwrócona | `--bg-inverse` | powiadomienia, podpowiedzi, pasek akcji zbiorczych |
| Linie | `--border-subtle`, `--border`, `--border-strong`, `--border-control` | podział, krawędź kontenera, hover, krawędź pola (≥ 3:1) |
| Tekst | `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-disabled` | treść, opis, metadane, nieaktywne |
| Akcent | `--accent`, `--accent-hover`, `--accent-fill`, `--accent-soft`, `--accent-ring`, `--on-accent` | interakcja |
| Stany | `--success`, `--warning`, `--danger`, `--info`, `--review`, `--neutral` + `-soft` | znaczenie |

Warianty akcentu (`data-accent`): **standard** (malinowy ETROM), **hydro** (morski),
**graphite** (grafit). Zmieniają tylko akcent — stany zostają.

Kontrast jest sprawdzany automatycznie: `tests/tokens.test.js` liczy WCAG dla
każdej pary tekst/tło w obu motywach i w każdym wariancie akcentu. Zmiana
palety, która pogorszy czytelność, nie przejdzie testów.

### Typografia

Krój systemowy (Segoe UI Variable na Windows) — aplikacja działa bez sieci.
Bazowy rozmiar **14 px**. Liczby zawsze tabelaryczne (`font-variant-numeric: tabular-nums`).

| Rola | Klasa / token | Rozmiar / wysokość / grubość |
|---|---|---|
| Tytuł strony | `.t-page-title` | 20 / 28 / 600 |
| Tytuł sekcji | `.t-section-title`, `.section__title` | 16 / 24 / 600 (w sekcjach treści 14 / 600) |
| Tytuł elementu | `.t-title` | 14 / 20 / 500 |
| Tekst | `.t-body` | 14 / 20 / 400 |
| Tekst pomocniczy, tabele | `.t-secondary` | 13 / 18 |
| Etykiety, nagłówki kolumn | `.t-label` | 12 / 16 / 500 |
| Metadane | `.t-meta` | 12 / 16, `--text-tertiary` |
| Wartość kluczowa (KPI) | `.t-kpi`, `.stat__value` | 20–24 / 600, tabelaryczne |
| Kod projektu | `.t-mono` | krój monospace, 0,92 em |

Nagłówki zdaniem, nie WERSALIKAMI. Daty skrócone (`12 paź`, rok tylko gdy inny niż bieżący),
liczby przez `ETROM.Format` (polska odmiana: *1 projekt, 3 projekty, 5 projektów*).

### Odstępy

Siatka 4 px: `--space-0-5` (2) · `1` (4) · `1-5` (6) · `2` (8) · `2-5` (10) · `3` (12) · `4` (16) · `5` (20) · `6` (24) · `8` (32) · `10` (40) · `12` (48).
Odstęp między sekcjami strony: 20–24 px. Wewnątrz komponentu: 8–12 px.

### Promienie — trzy wartości i koło

`--radius-sm` 4 px (plakietki, klawisze, pola wyboru) · `--radius-md` 6 px (przyciski, pola, pozycje menu) ·
`--radius-lg` 8 px (kontenery, menu, okna, karty) · `--radius-full` (awatary, przełączniki).
Test pilnuje, żeby nie pojawiła się czwarta wartość.

### Rozmiary kontrolek

`--control-sm` 28 px (akcje w wierszach) · `--control-md` 32 px (domyślne) · `--control-lg` 36 px.
Wiersz tabeli `--row-height` 44 px. Ikony 14 / 16 / 20 px.

### Elewacja

| Poziom | Token | Gdzie |
|---|---|---|
| Treść | brak — obrys `--border-subtle` | tabele, listy, karty |
| Przyklejone | `--elev-sticky` | pasek górny, nagłówek tabeli |
| Uniesione | `--elev-raised` | przyciski z obrysem, karta po najechaniu |
| Popover | `--elev-popover` | menu, ustawienia, podpowiedzi |
| Modal | `--elev-modal` | okna, panel boczny, paleta |
| Powiadomienie | `--elev-toast` | toasty, pasek akcji zbiorczych |

### Ruch

`--duration-instant` 80 ms (hover) · `fast` 120 ms (menu, fokus) · `base` 180 ms (okna, przejścia) · `slow` 260 ms (panel boczny, postęp).
Krzywe `--ease-out` (wejście), `--ease-in` (wyjście). Przy `prefers-reduced-motion` wszystkie czasy = 0.
Ruch występuje wyłącznie: przy zmianie ekranu (przenikanie treści), otwarciu okna/menu,
zmianie wartości postępu (od poprzedniej do nowej) i podświetleniu zmienionego wiersza.

## 3. Komponenty — `src/ui/components.js` + `styles/components.css`

Widoki **nie składają klas ręcznie**. Wołają funkcje `ETROM.UI.*`:

| Komponent | Funkcja | Uwagi |
|---|---|---|
| Button | `UI.button({label, variant, size, icon, kbd})` | warianty: `primary` (jeden na ekran), `secondary`, `tertiary`, `ghost`, `danger`, `danger-solid`; stan ładowania `aria-busy` |
| Icon button | `UI.iconButton({icon, label})` | etykieta obowiązkowa — trafia do `aria-label` i podpowiedzi |
| Input, Textarea, Select | `UI.input`, `UI.textarea`, `UI.select` | jedna wysokość 32 px, fokus = obrys akcentu + poświata |
| Field | `UI.field({id, label, control, required, optional, hint, error})` | gwiazdka dla wymaganych, „opcjonalnie” dla opcjonalnych, błąd z ikoną, `aria-describedby` i `aria-invalid` ustawiane automatycznie |
| Checkbox, Radio | `UI.checkbox` / `.radio` | własny rysunek, natywne zachowanie, stan pośredni |
| Switch | `UI.switchControl` | `role="switch"`, zmiana działa od razu |
| Search | `UI.searchInput({kbd: '/'})` | ikona, skrót znika po wpisaniu |
| Segmented | `UI.segmented` | przełącznik widoku, motywu, filtra zakładki |
| Status | `UI.status(scope, key)` | ikona kształtu + nazwa; `scope`: `project`, `stage`, `task` |
| Status do zmiany | `UI.statusButton` | wygląda jak status, działa jak przycisk (cykl albo menu) |
| Badge | `UI.badge(text, tone)` | tony: `info`, `success`, `warning`, `danger`, `review`, `accent`; `outline` dla odnośników |
| Termin | `UI.due(value, info)` | zwykły tekst; kolor i ikona tylko przy przekroczeniu lub < 7 dniach |
| Postęp | `UI.progress(percent)` | grafit; zielony dopiero przy 100%; `role="progressbar"` |
| Avatar | `ETROM.Avatar.avatar` / `avatarStack` | barwa z identyfikatora osoby, stos z licznikiem |
| Tooltip | atrybut `data-tooltip` | `ETROM.Tooltip`: najechanie z opóźnieniem, fokus klawiatury od razu |
| DropdownMenu | `ETROM.Menu.bind(button, build)` | `role="menu"`, strzałki, Home/End, pierwsza litera, Escape zwraca fokus; pozycje `radio`/`checkbox` |
| Popover | `ETROM.Menu.open({anchor, content})` | panel z dowolną treścią (ustawienia) |
| Tabs | `UI.tabs` | zakładki jako linki — adres zmienia się razem z widokiem |
| Breadcrumb | `UI.breadcrumb` | w pasku górnym |
| Modal | `Dialog.confirm`, `Dialog.prompt` | tylko dla czynności nieodwracalnych i pytań wymagających treści |
| Drawer | `Dialog.openDrawer` + `Dialog.drawerForm` | wszystkie formularze; przyklejona stopka z akcjami, `Ctrl+Enter` zapisuje |
| Toast | `Toast.show({message, tone, actionLabel, onAction})` | „Cofnij” zamiast „Czy na pewno?”; wstrzymanie po najechaniu |
| Alert | `UI.alert({tone, text})` | komunikat w treści strony |
| Table | klasy `.table-wrap`, `.table`, `.table__sort` | przyklejony nagłówek, sortowanie z nagłówka, zaznaczanie, akcje wiersza w menu |
| Bulk bar | `.bulkbar` | pojawia się po zaznaczeniu wierszy |
| Pagination | `UI.pagination` | powyżej 50 pozycji |
| Skeleton | `UI.skeleton` | stan ładowania |
| EmptyState | `UI.emptyState({icon, title, text, actions})` | co tu będzie, dlaczego pusto, następny krok |
| PageHeader | `UI.pageHeader` | tytuł, opis z liczbami, akcje |
| Toolbar / FilterBar | `.toolbar`, `.filter-btn` | filtr pokazuje bieżącą wartość; aktywny ma pełny obrys |
| Card, Section | `.card`, `.section` | kontener i sekcja z nagłówkiem |

### Ikony

Jeden zestaw w `src/ui/icons.js`: siatka 24, kontur 1,6, zaokrąglone końce.
Ikona wspiera tekst. Ikona bez tekstu = `UI.iconButton` z etykietą i podpowiedzią.

### Status — słownik kształtów

| Kształt | Znaczenie | Ton |
|---|---|---|
| ◌ koło przerywane | Przygotowanie | neutralny |
| ○ puste koło | Do wykonania | neutralny |
| ◐ półkole | W toku / W realizacji | info |
| ◕ trzy czwarte | Do zatwierdzenia | review |
| ⓘ koło z wykrzyknikiem | Do poprawy | warning |
| ⏸ koło z pauzą | Wstrzymany | warning |
| ● z ptaszkiem | Zakończony | success |

## 4. Szkielet i nawigacja

- **Panel boczny (240 px):** znak, wyszukiwanie (`Ctrl K`), sekcje (Projekty, Zespół) z licznikami,
  skróty do projektów *w realizacji* (z ostrzeżeniem po terminie), na dole „Ustawienia i dane”.
  Ustawienia i operacje na danych nie stoją obok nawigacji — są w jednym menu.
- **Pasek górny (48 px):** ścieżka (breadcrumb), stan zapisu. Przyklejony, półprzezroczysty.
- **Adresy:** `#/projekty`, `#/projekty/:id`, `#/projekty/:id/zadania`, `#/projekty/:id/zespol`, `#/zespol`.
  Działa Wstecz, odświeżenie i link do konkretnego projektu. Po zmianie ekranu fokus trafia na nagłówek `h1`.
- **Strona:** maks. 1440 px treści, margines 32 / 24 / 16 px zależnie od szerokości.

## 5. Wzorce interakcji — od najlżejszego

1. **Podpowiedź** — wyjaśnienie ikony, pełna data, pełna nazwa.
2. **Menu** — wybór z listy: status, filtr, sortowanie, akcje wiersza.
3. **Rozwinięcie w miejscu** — zadania etapu pod wierszem.
4. **Panel boczny (drawer)** — każdy formularz tworzenia i edycji; kontekst strony zostaje widoczny.
5. **Okno modalne** — tylko pytanie wymagające decyzji lub treści (usunięcie wszystkich danych, powód zwrotu do poprawy).
6. **Pełny widok** — szczegóły projektu z zakładkami.

Zasady stałe:
- **Jeden przycisk główny na ekranie.** Przy pustym stanie główną akcję przejmuje pusty stan.
- **Rzadkie i ryzykowne akcje w menu „…”,** nie na stałe w wierszu.
- **Usunięcie bez pytania, z „Cofnij”.** Pytanie tylko tam, gdzie cofnąć się nie da.
- **Akcje wiersza** widoczne po najechaniu lub fokusie (na ekranach dotykowych zawsze).
- **Przerysowanie nie gubi fokusu** — elementy z `data-fk` odzyskują fokus (`Dom.patch`).

### Skróty klawiszowe

`Ctrl K` paleta · `N` nowy projekt / nowa osoba · `E` edycja projektu · `/` wyszukiwarka ·
`Esc` zamyka menu, panel, okno, odznacza wiersze · `Ctrl Enter` zapisuje formularz · strzałki w menu i palecie.

## 6. Informacja zwrotna

| Sytuacja | Wzorzec |
|---|---|
| Zapis | stan w pasku górnym („Zapisano” / „Zapis niedostępny”) |
| Sukces po formularzu | toast `success`, krótki |
| Usunięcie, zmiana zbiorcza | toast z „Cofnij” |
| Odmowa (reguła modelu) | toast `danger` z powodem i drogą wyjścia |
| Błąd pola | pod polem, z ikoną, fokus na pierwszym błędnym polu |
| Pusto | `EmptyState` z następnym krokiem |
| Brak wyników filtra | `EmptyState` z „Wyczyść filtry” |
| Ładowanie | `Skeleton` |

## 7. Responsywność

Układ zmienia się, a nie tylko zmniejsza. Kolumny tabel i wierszy chowają się
według **szerokości obszaru treści** (container queries), nie okna:

- ≥ 64 rem treści: pełna tabela.
- 48–64 rem: bez kolumny Zespół, potem bez Zamawiającego.
- < 48 rem: bez Etapów i Zadań, postęp jako liczba.
- < 40 rem: nazwa, status jako ikona, termin; panel boczny wysuwany, formularze na całą szerokość.

## 8. Dostępność (WCAG 2.2 AA)

- Kontrast tekstu ≥ 4,5:1, krawędzi pól ≥ 3:1 — sprawdzane testem w obu motywach.
- Stan nigdy tylko kolorem: kształt ikony + nazwa.
- Pełna obsługa klawiaturą; widoczny pierścień fokusu tylko dla klawiatury (`:focus-visible`).
- Semantyka: `nav`, `main`, `header`, nagłówki w kolejności, `aria-current` w nawigacji i zakładkach,
  `aria-sort` w tabeli, `aria-expanded` w rozwinięciach i menu, `role="progressbar"`, `role="switch"`.
- Etykieta dla każdego pola i każdej ikony; błędy powiązane przez `aria-describedby`.
- Cele dotyku ≥ 24 px (WCAG 2.5.8), domyślnie 32 px.
- Link „Przejdź do treści”, `prefers-reduced-motion` respektowane.

## 9. Mikrocopy

- Czasowniki w przyciskach: *Utwórz projekt, Zapisz zmiany, Dodaj zadanie*.
- Dopełnienie przy niszczących: *Usuń wszystkie dane…*, nie „Wyczyść”.
- Wielokropek „…” = akcja otworzy okno lub panel z dalszym wyborem.
- Liczby odmienione: *3 projekty*, *5 osób*. Bez „projekty: 3”.
- Komunikat odmowy mówi **dlaczego** i **co zrobić**.

## 10. Jak dodać nowy ekran

1. Struktura: `UI.pageHeader` → `.toolbar` → treść (`.table-wrap`, `.list`, `.card`).
2. Każdy kolor, odstęp, promień i cień z tokenów. Nowa wartość = zmiana `tokens.css` i tego dokumentu.
3. Stan przez `UI.status`, termin przez `UI.due`, liczby przez `ETROM.Format`.
4. Formularz w panelu: `Dialog.drawerForm` + `UI.field`.
5. Pusty stan, brak wyników i błąd — zaprojektowane, nie domyślne.
6. Zrzuty w `tools/screenshot.js` przy 1440, 1024 i 390 px, w obu motywach, i sprawdzenie w `tests/browser/smoke.js`.
