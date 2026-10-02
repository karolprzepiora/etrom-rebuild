# ETROM — UI/UX Standard v2.1

Obowiązujący standard interfejsu ETROM. Każdy nowy ekran i każda nowa funkcja
korzysta z tych tokenów, komponentów i elementów charakterystycznych.
Odstępstwo wymaga zmiany tego dokumentu, a nie lokalnego wyjątku w CSS.

- **Dlaczego tak wygląda** — [ART_DIRECTION.md](ART_DIRECTION.md) (język wizualny, elementy charakterystyczne, ruch).
- **Jak to stosować** — ten dokument.
- Wersja 1.0 ustaliła fundamenty i komponenty; wersja 2.0 nadała im tożsamość
  (kroje, warstwy, kolor „teraz / ryzyko”, rzędna, profil, inspektor).
- Wersja 2.1 (szlif produktu) nie zmienia kierunku: kokpit portfela stał się narzędziem
  filtrującym, puste ekrany prowadzą przez pierwsze kroki, tekst pomocniczy urósł do
  rozmiarów wygodnych przy całodziennej pracy.

Kolejność priorytetów przy każdej decyzji:
**czytelność → intuicyjność → szybkość pracy → hierarchia → spójność → dostępność → estetyka → wrażenie premium.**

## 1. Fundamenty — `styles/tokens.css`

Jedyne miejsce z wartościami. Każda barwa ma postać `light-dark(jasny, ciemny)`;
motyw wybiera `color-scheme` (`data-theme="light|dark"` albo ustawienie systemu).

### Warstwy

| Token | Rola |
|---|---|
| `--canvas` | kalka: tło okna i panelu nawigacji |
| `--sheet` | arkusz roboczy |
| `--wash`, `--wash-2` | ton w arkuszu: grupy, nagłówek projektu, kokpit, wnęki |
| `--raised` | arkusz pływający: inspektor, menu, okna |
| `--hover`, `--pressed` | stany interakcji |
| `--inverse`, `--on-inverse` | podpowiedzi, powiadomienia, pasek akcji zbiorczych |
| `--backdrop` | przyciemnienie pod oknem modalnym |

### Tusz (struktura i rzeczy zakończone)

`--ink` (tekst główny, przycisk główny, zaznaczenie) · `--ink-2` (opis) ·
`--ink-3` (metadane, ≥ 4,5:1 na każdej warstwie) · `--ink-4` (tylko dekoracja) ·
`--ink-hover`, `--on-ink` · `--done` (zakończone odcinki i węzły).

### Kolor „teraz” i „ryzyko”

| Rola | Znacznik (≥ 3:1) | Tekst (≥ 4,5:1) | Tło |
|---|---|---|---|
| Nurt — w toku | `--flow` | `--flow-ink` | `--flow-wash` |
| Stan ostrzegawczy | `--warn` | `--warn-ink` | `--warn-wash` |
| Stan alarmowy | `--alarm` | `--alarm-ink` | `--alarm-wash` |
| Do zatwierdzenia | `--review` | `--review` | `--review-wash` |

Warianty barwy „teraz” (`data-accent`): **standard** (nurt), **graphite**, **raspberry**.
Zmieniają tylko nurt — tusz i stany ryzyka zostają.

Kontrast sprawdza `tests/tokens.test.js` w obu motywach i każdym wariancie.

### Linie

`--line` (podział wewnątrz arkusza) · `--line-strong` · `--control-line` (krawędź pól, ≥ 3:1) ·
`--track`, `--track-done` (profil przebiegu).
Linia jest wyjątkiem: najpierw ton, odstęp i typografia.

### Typografia

| Rola | Krój | Rozmiar | Gdzie |
|---|---|---|---|
| Tytuł ekranu | Display 600–700 | `--fs-3xl` 28 | Projekty, Zespół |
| Nazwa projektu | Display | `--fs-4xl` 36 | nagłówek przestrzeni projektu |
| Liczba kluczowa | Display, cyfry tabelaryczne | `--fs-5xl`–`--fs-6xl` 44–56 | kokpit, postęp w nagłówku |
| Tytuł sekcji | Text 600 | `--fs-lg` 16 | sekcje, formularze |
| Nazwa w wierszu | Text 600 | `--fs-row` 14 | projekty, osoby, etapy |
| Tekst roboczy | Text 400 | `--fs-md` 14 | wiersze, menu, formularze |
| Pomocniczy | Text | `--fs-sm` 13 | opisy, powody, drugi wiersz w tabeli |
| Metadane | Text | `--fs-meta` 12, `--ink-3` | kody, podpisy w tabelce |
| Kod projektu | Text, `.code` | `--fs-meta`, tnum, przekreślone zero | wszędzie, gdzie stoi kod |

`--font-display` = ETROM Display (Instrument Sans), `--font-text` = ETROM Text (Inter);
oba osadzone w `styles/fonts.css` (generuje `tools/build-fonts.py`, licencje w `docs/licenses/`).
Nagłówki zdaniem, nie wersalikami. Liczby przez `ETROM.Format` (polska odmiana).
**Dolna granica: 12 px** dla każdego tekstu, który trzeba przeczytać (wyjątek: inicjały
w awatarze). Elegancji nie osiąga się zmniejszaniem — tylko odstępem, grubością i tonem.

### Odstępy, promienie, elewacja, ruch

- **Odstępy:** siatka 4 px, `--space-0-5` … `--space-16`.
- **Promienie rosną ze skalą:** `--radius-xs` 4 (plakietki) · `--radius-sm` 7 (przyciski, pola, nawigacja) ·
  `--radius-md` 10 (płaszczyzny, menu, okna) · `--radius-lg` 14 (arkusz, inspektor) · `--radius-full`.
- **Elewacja:** `--elev-lift` (pozycja wzniesiona do arkusza) · `--elev-hover` · `--elev-sheet` (arkusz) ·
  `--elev-pop` (menu) · `--elev-float` (inspektor, okna).
- **Ruch:** `--duration-instant` 80 · `fast` 140 · `base` 200 · `slow` 300 ms;
  `--ease-out` (wejście), `--ease-spring` (drobne „wyskoczenie” węzła, pola wyboru).
  Ruch ciągły kończy się po kilku cyklach. `prefers-reduced-motion` zeruje czasy.

## 2. Elementy charakterystyczne — `src/ui/signature.js` + `styles/signature.css`

| Element | Funkcja | Zasady |
|---|---|---|
| Rzędna ▽ | `Sig.datum(level)` | `normal` / `warning` / `alarm` / `closed`; zawsze z powodem w słowach lub w podpowiedzi |
| Profil przebiegu | `Sig.profile(project, {size})` | `micro` (wiersz), `card` (karta), `macro` (nagłówek); odcinki ∝ godzinom; `Sig.settle` animuje grot i liczbę |
| Linijka czasu | `Sig.timeRuler(project)` | ta sama skala co profil; kreska „dziś”, bursztyn przy opóźnieniu, czerwień po terminie |
| Oś etapów | klasy `.rail`, `.rail__node--*` | węzły: tusz/ptaszek, nurt/pierścień, pusty, czerwony pierścień |
| Inspektor | `ETROM.Inspector.render` | zadanie, osoba, projekt; Escape zamyka i oddaje fokus |
| Kokpit portfela | `ProjectList.cockpit(projects, ctx)` | każda liczba, stan i termin jest przyciskiem: filtruje listę albo otwiera projekt / etap |

#### Kokpit jako narzędzie

| Element kokpitu | Działanie |
|---|---|
| Liczba „wymagają uwagi” | filtr `health: attention` (stan ostrzegawczy + alarmowy); ponownie — zdejmuje |
| Pozycja projektu z powodem | otwiera projekt |
| Pozycja legendy „Stan portfela” | filtr `health: <poziom>`; pozostałe odcinki paska bledną |
| „Pokaż N projektów” przy terminach | filtr `horizon: 60` (termin umowy lub etapu w 60 dniach), sortowanie po terminie |
| Znacznik na osi, pozycja terminu | otwiera projekt, a dla etapu — przewija do etapu i go rozwija |

Zawężenie z kokpitu pojawia się w pasku filtrów jako zdejmowalny znacznik (`#tb-scope`)
i jest zwykłym filtrem `Query.filterAndSort` (`health`, `horizon`, testy w `tests/query.test.js`).
Stan aktywny: `aria-pressed="true"` i obrys tuszem.

Wnioski liczy `src/core/insight.js` (testy w `tests/insight.test.js`): stan projektu i powody,
profil, harmonogram (opóźnienie wobec czasu), najbliższe zdarzenie, przegląd portfela,
obciążenie osoby. Interfejs tylko to rysuje.

## 3. Komponenty — `src/ui/components.js` + `styles/components.css`

Widoki nie składają klas ręcznie — wołają `ETROM.UI.*`:

| Komponent | Funkcja | Uwagi |
|---|---|---|
| Button | `UI.button({label, variant, size, icon, kbd})` | `primary` (tusz, jeden na ekran), `secondary`, `tertiary`, `ghost`, `danger`, `danger-solid`; rozmiary `sm` / `lg` |
| Icon button | `UI.iconButton({icon, label})` | etykieta obowiązkowa — `aria-label` + podpowiedź |
| Pola | `UI.input`, `UI.textarea`, `UI.select`, `UI.checkbox`, `UI.switchControl`, `UI.searchInput` | jedna wysokość, fokus = obrys nurtu |
| Field | `UI.field({id, label, control, required, optional, hint, error})` | gwiazdka, „opcjonalnie”, błąd z ikoną, `aria-describedby` / `aria-invalid` |
| Status | `UI.status`, `UI.statusButton`, `UI.statusGlyph` | koło o kształcie stanu + nazwa; ton `flow` dla pracy w toku, `done` (tusz) dla zakończonej |
| Badge | `UI.badge(text, tone)` | drobna etykieta |
| Termin | `UI.due(value, info)` | kolor i ikona tylko przy przekroczeniu lub pilnym terminie |
| Segmented, Tabs, Breadcrumb | `UI.segmented`, `UI.tabs`, `UI.breadcrumb` | zakładki to linki z adresem; wskaźnik przesuwa się przejściem |
| PageHeader, EmptyState, Alert, Skeleton, Pagination | `UI.pageHeader`, `UI.emptyState`, `UI.alert`, `UI.skeleton`, `UI.pagination` | pusty stan: co tu będzie, dlaczego pusto, następny krok |
| Onboarding | `UI.onboarding({title, text, steps, actions, note, preview})`, `UI.ghost(width)` | pierwszy start ekranu: tytuł, trzy kroki, przycisk główny ze skrótem, dane przykładowe, podgląd „tak to będzie wyglądać” z prawdziwych komponentów |
| Menu i popover | `ETROM.Menu.bind` / `open` | strzałki, Home/End, pierwsza litera, Escape oddaje fokus |
| Tooltip | atrybut `data-tooltip` | fokus klawiatury pokazuje od razu |
| Okna | `Dialog.confirm`, `Dialog.prompt`, `Dialog.openDrawer` + `Dialog.drawerForm` | formularze w panelu z przyklejoną stopką, `Ctrl+Enter` zapisuje |
| Toast | `Toast.show({message, tone, actionLabel, onAction})` | „Cofnij” zamiast „Czy na pewno?” |

## 4. Szkielet i nawigacja

- **Panel boczny na kalce** (240 px, zwijany do 56 px klawiszem `[`, stan zapamiętany):
  przełącznik przestrzeni ETROM, Szukaj (`Ctrl K`), Utwórz (`+`), Projekty i Zespół z licznikami
  (przy Projektach liczba stanów alarmowych), **Przypięte** i **Ostatnio otwierane** projekty
  ze znakiem rzędnej, na dole stan zapisu i skróty.
- **Arkusz roboczy** uniesiony nad kalką; pasek górny ze ścieżką i działaniami kontekstowymi
  (przypnij, edytuj, więcej) przykleja się podczas przewijania.
- **Adresy:** `#/projekty`, `#/projekty/:id`, `…/zadania`, `…/zespol`, `#/zespol`.
- **Inspektor** pływa nad arkuszem po prawej, nie zmienia adresu ani przewinięcia.

## 5. Wzorce interakcji — od najlżejszego

1. **Podpowiedź** — pełna data, nazwa etapu w profilu, powód stanu.
2. **Menu** — status, filtr, sortowanie, akcje wiersza.
3. **Rozwinięcie w miejscu** — zadania etapu (bieżący etap otwarty sam).
4. **Inspektor** — podgląd zadania, osoby, projektu bez opuszczania miejsca.
5. **Panel boczny (drawer)** — każdy formularz tworzenia i edycji.
6. **Okno modalne** — tylko decyzja nieodwracalna albo pytanie o treść.
7. **Pełny widok** — przestrzeń projektu.

Zasady stałe: jeden przycisk główny na ekranie; rzadkie i ryzykowne akcje w menu „…”;
usunięcie od razu, z „Cofnij”; dane zmieniają się natychmiast, animacja tylko to pokazuje;
przerysowanie nie gubi fokusu (`data-fk`, `Dom.patch`).

### Skróty

`Ctrl K` paleta · `N` nowy projekt / osoba · `E` edycja projektu · `/` wyszukiwarka ·
`Spacja` na projekcie — podgląd · `G P` / `G Z` — Projekty / Zespół · `[` panel boczny ·
`?` lista skrótów · `Esc` zamyka inspektor, menu, panel, okno, odznacza ·
`Ctrl Enter` zapisuje formularz.

## 6. Informacja zwrotna

| Sytuacja | Wzorzec |
|---|---|
| Zapis | „Zapisano lokalnie” na dole panelu; ptaszek rysuje się przy każdym zapisie |
| Sukces po formularzu | toast `success` |
| Usunięcie, zmiana zbiorcza | toast z „Cofnij” |
| Odmowa reguły | toast `danger` z powodem i wyjściem |
| Błąd pola | pod polem, fokus na pierwszym błędnym |
| Ryzyko w projekcie | rzędna + powód w wierszu, w kokpicie i w panelu stanu projektu |
| Pierwszy start ekranu | `UI.onboarding` (Projekty, Zespół) |
| Brak wyników filtra | `EmptyState` z „Wyczyść filtry” |

## 7. Responsywność

Układ zmienia się według szerokości **obszaru treści** (container queries):
pełne kolumny na monitorze, mniej kolumn na laptopie, na telefonie panel boczny
wysuwany, kokpit w jednej kolumnie, nagłówek projektu z faktami w dwóch kolumnach,
formularze na całą szerokość.

## 8. Dostępność (WCAG 2.2 AA)

- Kontrast tekstu ≥ 4,5:1, znaczników i krawędzi pól ≥ 3:1 — sprawdzane testem.
- Stan nigdy tylko kolorem: kształt rzędnej i koła statusu + słowa.
- Pełna obsługa klawiaturą, `:focus-visible`, fokus wraca po zamknięciu inspektora, menu, okna.
- `aria-current` w nawigacji i zakładkach, `aria-sort`, `aria-expanded`, `role="switch"`,
  opis profilu przebiegu dla czytnika ekranu.
- `prefers-reduced-motion` respektowane, ruch ciągły kończy się sam.

## 9. Jak dodać nowy ekran

1. Struktura: tytuł krojem Display → zdanie z liczbami → kokpit lub pasek narzędzi → treść.
2. Kolor tylko dla „teraz” i „ryzyka”. Wszystko inne tuszem i tonem.
3. Stan projektu przez `Sig.datum`, postęp przez `Sig.profile`, statusy przez `UI.status`.
4. Formularz w panelu (`Dialog.drawerForm` + `UI.field`), podgląd w inspektorze.
5. Puste stany, brak wyników i błędy zaprojektowane.
6. Zrzuty w `tools/screenshot.js` (1440 / 1024 / 390 px, oba motywy) i sprawdzenie w `tests/browser/smoke.js`.
7. Pytania kontrolne z [ART_DIRECTION.md](ART_DIRECTION.md).
