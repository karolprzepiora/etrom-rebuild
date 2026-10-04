# ETROM — UI/UX Standard v2.3

Obowiązujący standard interfejsu ETROM. Każdy nowy ekran i każda nowa funkcja
korzysta z tych tokenów, komponentów i elementów charakterystycznych.
Odstępstwo wymaga zmiany tego dokumentu, a nie lokalnego wyjątku w CSS.

- **Dlaczego tak wygląda** — [ART_DIRECTION.md](ART_DIRECTION.md) (język wizualny, elementy charakterystyczne, ruch).
- **Jak to stosować** — ten dokument.
- Wersja 1.0 ustaliła fundamenty i komponenty; wersja 2.0 nadała im tożsamość
  (kroje, warstwy, kolor „teraz / ryzyko”, rzędna, profil, inspektor).
- Wersja 2.3 wprowadza **ETROM Flow System** (Gauge, Flow, Level, Marker) — sekcja 2a.
- Wersja 2.2 przenosi paletę na barwy logo ETROM: łupek `#78909c` (neutralne tło i struktura
  w odcieniu stali), stalowy błękit jako „teraz”, magenta `#dd5799` wyłącznie jako znak marki.
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

### Znak marki

`--brand` (magenta z logo) **nie oznacza stanu**. Używamy jej tylko do tożsamości: logo,
wskaźnika aktywnej pozycji nawigacji, zaznaczenia tekstu. Nie wolno jej używać do statusów,
przycisków ani ostrzeżeń — żeby nie pomylić z czerwienią ryzyka.
Logo: `docs/brand/etrom-logo.png` → `tools/build-logo.py` → `styles/logo.css`
(warstwa barwna + napis malowany `--ink`, więc działa w obu motywach).

### Kolor „teraz” i „ryzyko”

| Rola | Znacznik (≥ 3:1) | Tekst (≥ 4,5:1) | Tło |
|---|---|---|---|
| Nurt — w toku | `--flow` | `--flow-ink` | `--flow-wash` |
| Stan ostrzegawczy | `--warn` | `--warn-ink` | `--warn-wash` |
| Stan alarmowy | `--alarm` | `--alarm-ink` | `--alarm-wash` |
| Do zatwierdzenia | `--review` | `--review` | `--review-wash` |

Warianty barwy „teraz” (`data-accent`): **standard** (nurt) i **graphite**. Wariant malinowy usunięto: był zbyt blisko magenty z logo, która jest kolorem marki, a nie stanu.
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
| Oś etapów | klasy `.rail`, `.rail__node--*` | węzły: tusz/ptaszek, nurt/pierścień, pusty, czerwony pierścień |
| Inspektor | `ETROM.Inspector.render` | zadanie, osoba, projekt; Escape zamyka i oddaje fokus |
| Widoki listy | `ProjectList.views(projects, ctx)` | zakładki z licznikami: Wszystkie, Moje, Wymaga uwagi, Po terminie, Zakończone + własne (`prefs.customViews`, do 6); wybór w `prefs.projectView` |
| Pasek stanu | `ProjectList.strip` | cienki pasek: wymaga uwagi / w normie / zakończone + godziny; kolor czerwony tylko dla „wymaga uwagi” |
| Panel terminów | `ProjectList.rail` | `Insight.dueItems`: zadania, odpowiedzi na pisma, terminy umów; Po terminie / Ten tydzień / Później |
| Postęp wobec planu | `.pf-meter` | pasek 6 px z kreską planu; kolor tylko przy zaległości (bursztyn ≥ 15 p.p., czerwień ≥ 30 p.p.) |

#### Zasady listy projektów

- Kolor tylko dla wyjątków: czerwony i bursztynowy wyłącznie dla tego, co wymaga reakcji; reszta w tuszu i szarościach.
- Wiersz: nazwa, pod nią kod i jedna linia powodu (dla projektów wymagających uwagi) albo zamawiający.
- Edycja w komórce: klik w lidera otwiera wybór osoby; zmiana jest od razu zapisywana (z „Cofnij”).
- Gęstość: `prefs.density` → `data-density` na `<html>`, zmienne `--row-h`, `--row-pad`.
- Język: „zaległość 12 p.p. wobec planu” z objaśnieniem w podpowiedzi, a nie sam skrót.
- Filtr `health: overdue` (`Query`) to projekty z czymkolwiek po terminie: umowa, zadanie albo odpowiedź na pismo (`Insight.hasOverdue`).

Miernik, tor przebiegu, poziom i znaczniki to **ETROM Flow System** (sekcja 2a).

Wnioski liczy `src/core/insight.js` (testy w `tests/insight.test.js`): stan projektu i powody,
profil, harmonogram (opóźnienie wobec czasu), najbliższe zdarzenie, przegląd portfela,
obciążenie osoby. Interfejs tylko to rysuje.

## 2a. ETROM Flow System

### Filozofia

Interfejs mówi językiem **pomiaru**, nie wody. Hydrotechnika jest strukturą, nie ozdobą:
wodowskaz → **Gauge**, przepływ → **Flow**, stan wody → **Level**, punkt pomiarowy → **Marker**.
Nie ma fal, kropel ani niebieskich gradientów. Po usunięciu koloru system nadal się czyta.
Cztery elementy to jeden język: **jedna linia (`--line-w` 1,5 px)**, jedne znaczniki,
jedne cyfry tabelaryczne, jeden ruch (`--motion-measure`). Kod: `src/ui/flowSystem.js`,
`styles/flow.css`, dane: `src/core/insight.js` (`gauge`, `profile`, `ladder`, `health`).

**Status ≠ Stan.** *Status* mówi, co się dzieje z projektem (Przygotowanie, W realizacji, Wstrzymany,
Zakończony) — to przycisk, bo użytkownik go zmienia. *Stan* mówi, czy projekt przebiega prawidłowo
(W normie, Stan ostrzegawczy, Stan alarmowy) — jest **liczony z danych**, nikt go nie ustawia.
Oba wymiary są niezależne i nigdy nie dzielą jednego znacznika.

### Nagłówek projektu — jeden rząd właściwości

Kod, status (przycisk, edytowalny), tytuł 28 px, zamawiający. Pod spodem **jeden rząd właściwości**:
Stan (kształt + słowa: Wymaga uwagi / W normie / Zakończony), Postęp (pasek 6 px z kreską planu,
„zaległość 39 p.p.” tylko przy zaległości), Termin umowy (klik otwiera wybór daty, zmiana od razu
z „Cofnij”), Godziny, Lider (klik zmienia osobę). Każdy fakt występuje raz.

**Wymaga uwagi · N** (`Insight.attentionItems`): ramka w kolorze wyjątku (czerwona przy alarmie,
bursztynowa przy ostrzeżeniu) z listą powodów i przyciskami działań („Zmień termin”, „Zamknij projekt”,
„Pokaż zadania”, „Dodaj zadania”, „Otwórz korespondencję”). Gdy nic nie wymaga reakcji — bloku nie ma.

Zakładki: Plan (etapy), Zadania, Korespondencja, Zespół, Czas (zapisany czas wg etapów), Aktywność
(`Insight.activity`). Bez bocznego panelu — dane w nagłówku, reszta w zakładkach Zespół i Aktywność.

### Flow — tor przebiegu (`Flow.flowTrack`)

Odcinek na etap, długość ∝ godzinom. Stany (`state` z `Insight.profile`):

| Stan | Rysunek |
|---|---|
| zakończony | tusz |
| bieżący | nurt z kreskowaniem (płynie 3 cykle), podkreślenie i pogrubiony numer |
| przyszły | ślad |
| opóźniony | czerwone kreskowanie jak w przekroju + czerwony romb terminu |
| zagrożony terminem | bursztynowy romb nad odcinkiem (termin ≤ 7 dni) |
| wstrzymany | kreskowanie tuszem, bez ruchu |
| zablokowany | zarezerwowany (gdy model dostanie blokadę etapu; dziś mapowany z projektu wstrzymanego) |

Rozmiary: **compact** (inspektor: tor z odczytem procentu i grotem), **mini** (sam tor, 5 px).
Tor nie jest już w nagłówku projektu — etapy pokazuje zakładka Plan.

### Level — stan projektu (`Flow.level`)

W inspektorze: jeden szczebel drabinki z powodami słowami. W widoku projektu stan niesie rząd właściwości
i lista „Wymaga uwagi”.

Drabinka progów: *Stan alarmowy* ▸ *Stan ostrzegawczy* ▸ *W normie*. Aktywny szczebel jest
podświetlony i oznaczony „teraz”, niesie **powód słowami** („Termin umowy minął 6 dni temu”).
Stan to najgorszy aktywny powód; reguły (`rule`) w `Insight.health`: `deadline-passed`, `deadline-near`,
`schedule-lag`, `tasks-late`, `stages-late`, `tasks-returned`, `project-paused`. Nowa reguła =
jeden blok w `health()` z identyfikatorem i poziomem (przewidziane: budżet godzin, brak wymaganych osób,
zablokowany kamień milowy, ryzyko). Kształt ▽ odróżnia stan bez koloru: kontur / wypełnienie /
wypełnienie ze znakiem / cienki kontur (zakończony). Rozmiary: **hero** (drabinka + powody),
**compact** (jeden szczebel + powody — inspektor); w portfolio ta sama drabinka jest legendą
stanu portfela z cienką miarą udziału pod każdym szczeblem.

### Marker (`Flow.marker`)

Znacznik punktu na osi, kształt niesie znaczenie: **grot** ▽ — teraz / bieżące położenie,
**pierścień** ○ — plan, **romb** ◇ — termin i kamień milowy (wypełniony, gdy minął),
**kreska** — próg etapu. Kolor tylko ostrzega (bursztyn, czerwień). Używany na torze, w mierniku,
pod torem pasa planu i na osi najbliższych terminów w portfolio.

### Semantyka koloru

| Barwa | Znaczy | Nie znaczy |
|---|---|---|
| Stalowy błękit (`--flow`) | przepływ teraz: bieżący etap, zakres etapu w mierniku, fokus, zaznaczenie | stan projektu |
| Bursztyn | stan ostrzegawczy, bliski termin, opóźnienie ≥ 15 pkt | marka |
| Czerwień | stan alarmowy, termin przekroczony, opóźnienie ≥ 30 pkt | marka |
| Tusz/grafit | zakończone, struktura, rzeczywisty postęp | — |
| Magenta (`--brand`) | wyłącznie marka (logo, wskaźnik nawigacji) | alarm, błąd, akcent akcji |

### Ruch

150–300 ms, `--ease-out`, bez odbicia. Grot i pasek miernika przesuwają się do nowej wartości,
liczba dolicza (`Flow.settle`), pasek miary w portfolio zmienia długość. Nurt płynie tylko w nagłówku
i tylko 3 cykle. `prefers-reduced-motion` zeruje czasy.

### Kiedy używać, a kiedy nie

- **Gauge** — tylko tam, gdzie postęp ma znaczenie decyzyjne: nagłówek projektu. Nie w wierszach, kartach ani raportach zbiorczych.
- **Flow mini/compact** — każdy projekt na liście i karcie; nie powielaj go na ekranie, który ma już hero.
- **Level hero** — jeden na ekran projektu; **compact** w panelach podglądu. W wierszu użyj samej rzędnej ▽ z powodem.
- **Marker** — tylko dla terminów i punktów na osi; nie jako ozdoba i nie jako licznik.
- Nie rysuj wody, fal, rur ani gradientów; nie koloruj stanu bez kształtu i słów; nie dubluj implementacji — nowe widoki wołają `ETROM.Flow.*`.

### Dostępność

Miernik i tor mają `role="img"`/`group` z pełnym opisem (postęp, plan, bieżący etap, zakres).
Odcinki toru w nagłówku to przyciski (`aria-current="step"` dla bieżącego), podpis etapu w mierniku też.
Szczebel stanu ma `aria-current`, powód jest tekstem. Informacja zawsze: kształt + tekst + liczba,
nigdy sam kolor. Fokus: ring nurtu. Kontrast par pilnuje `tests/tokens.test.js`.

### Tokeny

`--line-w`, `--tick-minor`, `--tick-major`, `--marker-size`, `--flow-seg-h`, `--flow-gap`, `--level-rung-h`, `--motion-measure`
(`styles/tokens.css`). Kolory wyłącznie semantyczne: `--flow`, `--done`, `--warn`, `--alarm`, `--track`, `--brand`.

## 2b. Etap: rodzaj pracy i ikona

Każdy etap ma trzy niezależne cechy: **rodzaj pracy** (`kind`), **temat** (`domain`: środowisko, wody, lokalizacja…) i **kolejność** w projekcie. Kolejność jest chronologiczna i nie zależy od rodzaju.

- **Rodzaje:** *Materiały* (dane wyjściowe, pomiary, badania), *Dokumentacja* (opracowania projektowe), *Decyzje* (postępowania i uzgodnienia, czyli czekanie na urząd). Etap własny wybiera rodzaj sam; dawne etapy własne dostają „Dokumentacja”.
- **Ikona (`Icons.stageIcon`)** to rysunek etapu na kafelku, siatka 24×24, kontur 1,6. Etap decyzyjny ma plakietkę ✓ w rogu, więc ten sam temat (np. woda) widać od razu jako dokumentację albo postępowanie. Etap własny używa symbolu swojego tematu.
- **Kolor nie koduje rodzaju w wierszu.** Kolor jest zarezerwowany dla stanu. Rodzaj pokazują ikona i podpis („Dokumentacja · wodnoprawne · standard 09”). Jedyny kolor rodzaju to pasek budżetu (`--kind-materials/docs/decision`, trzy odcienie jednego błękitu), w którym wypełnienie oznacza godziny już wykonane.
- **Grupuj wg rodzaju** to przełącznik widoku listy: dodaje nagłówki rodzajów z sumą godzin, numeracja pozostaje chronologiczna.
- Dane: `Catalog.KINDS`, `Insight.budgetByKind(project)`.

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

## Moja praca (z dawną Skrzynką)

- Jedno miejsce na „co mam zrobić”: sekcja „Wymaga reakcji” (zatwierdzenia, pisma) nad zadaniami według czasu; pasek alarmów projektów dla liderów. Objaśnienia nie zajmują ekranu — są w dymkach (`.ibx__info[data-tooltip]`). Reakcje to lista „do reakcji”, nie archiwum: bez „przeczytane”, pozycja znika, gdy sprawa jest załatwiona. Jedyny zapis to odłożenie do jutra (`prefs.snoozed`).
- Kolor tylko dla pilnych: lewa kreska i ikona w tonie alarmu przy pozycji po terminie, reszta neutralna.
- Obie listy używają zakładek z licznikami (`pf-view`), płaskich wierszy z linią zamiast kart z cieniem i gęstości `--row-h`; `J`/`K` przechodzą po wierszach.

## Aktualności

- Jedna wąska kolumna (42 rem) jak strumień społecznościowy: pasek projektów z pierścieniem stanu, kompozytor, zakładki, karty pod separatorami dni.
- Karta: awatar, autor, czas względny (`Format.ago`), plakietka projektu, treść, reakcje (chipy; własna reakcja z kolorem akcentu), komentarze rozwijane w karcie. Bez płciowych czasowników: „Zadanie «X» — nowy status: W toku”.
- Kolor tylko dla stanu projektu (pierścień) i własnych reakcji; cytat powodu zwrotu z kreską w tonie alarmu.
- Szkice wpisu i komentarzy żyją poza przerysowaniem, żeby klik w reakcję nie kasował pisanego tekstu.
- Czas pracy innych osób pojawia się tylko liderowi projektu i zarządowi.

## Język „karty i pigułki” (styles/polish.css)

Wszystkie ekrany używają jednego języka, ładowanego ostatnim arkuszem:
- **Karty zamiast linii**: wiersze list i tabel (projekty, zadania, etapy, Zespół, Skrzynka, Moja praca) są zaokrąglonymi kartami (14–20 px) z cienką ramką `inset`. Po najechaniu unoszą się o 1–2 px.
- **Stan = kolor z lewej**: czerwony (alarm) lub bursztynowy (uwaga) pasek 4 px po lewej stronie wiersza, w nagłówkach i na kartach pigułka „Alarm” / „Uwaga”.
- **Pigułki**: zakładki, przełączniki, plakietki, numer projektu (czarna pigułka `#2602`).
- **Wstęga czasu umowy**: pasek od założenia projektu do terminu ze znacznikiem „dziś” — nie jest postępem prac (postęp trafi do zakładki Analiza).
- **Tło**: łuna marki (magenta) i nurtu (błękit) pod arkuszem; arkusz ma promień 22 px.
- **Nagłówki małych sekcji**: wielkie litery, rozstrzelone, 11 px; tytuły stron 40 px, grube.
- **Ruch**: jedna krzywa `cubic-bezier(.2,.8,.2,1)`, 150–220 ms; wszystko wyłączane przy `prefers-reduced-motion`.
- Nowy ekran dziedziczy to automatycznie, gdy używa klas `.trow`, `.mrow`, `.fd__card`, `.pc`, `.plan-row`, `.tabs` lub `.pf-views`.

## 9. Jak dodać nowy ekran

1. Struktura: tytuł krojem Display → zdanie z liczbami → kokpit lub pasek narzędzi → treść.
2. Kolor tylko dla „teraz” i „ryzyka”. Wszystko inne tuszem i tonem.
3. Stan projektu przez `Sig.datum`, postęp przez `Sig.profile`, statusy przez `UI.status`.
4. Formularz w panelu (`Dialog.drawerForm` + `UI.field`), podgląd w inspektorze.
5. Puste stany, brak wyników i błędy zaprojektowane.
6. Zrzuty w `tools/screenshot.js` (1440 / 1024 / 390 px, oba motywy) i sprawdzenie w `tests/browser/smoke.js`.
7. Pytania kontrolne z [ART_DIRECTION.md](ART_DIRECTION.md).

## Analiza

Ekran `#/analiza` (skrót `G N`) odpowiada na pytanie „czy projekty mieszczą się w godzinach i w pieniądzach”. Liczy je `src/core/analysis.js`, rysuje `src/ui/charts.js` (czysty SVG, bez bibliotek), układa `src/ui/analysisScreen.js`.

- **Dostęp:** zarząd widzi wszystkie projekty i finanse; lider swoje projekty bez finansów; pozostali dostają pusty stan z wyjaśnieniem.
- **Wskaźniki:** postęp rzeczowy = Σ godzin etapów × stopień ukończenia; zużycie = czas zespołu + korekty zarządu; CPI = postęp/zużycie; SPI = postęp/upływ czasu umowy; EAC = budżet/CPI.
- **Werdykt:** W normie · Obserwuj · Zagrożony · Zakończony · Brak danych (kolory: nurt, ostrzeżenie, alarm, szarość).
- **Układ:** kafle → mapa projektów (X postęp, Y zużycie, nad przekątną wydajemy szybciej niż robimy) + „Najwięcej uwagi” → szczegóły wybranego projektu (spalanie godzin z prognozą wyczerpania, trzy pasy, wskaźniki, budżet etapów, rodzaje pracy, osoby, opłacalność) → trend 12 tygodni → tabela wszystkich projektów.
- **Opłacalność:** wartość umowy (pole w formularzu projektu, tylko zarząd) i „Koszt godziny” (ustawienie na ekranie, domyślnie 0 = brak finansów).
- Wykresy używają klas `ch-*`, barw wyłącznie z tokenów (poza paletą kategorii `ch-c0…7`, `ch-s0…5`).

## Aktualności jako firmowe media społecznościowe

Układ dwukolumnowy na całą szerokość: oś czasu (kompozytor, przypięte ogłoszenia, filtry, karty) i prawy panel (projekty w toku, wyróżnienia, zespół). Poniżej 66 rem panel schodzi pod oś.

- **Rodzaje wpisów** (`social.js`): wpis, ogłoszenie (tylko zarząd, domyślnie przypięte), ankieta (2–5 odpowiedzi, zmiana i cofnięcie głosu), wyróżnienie osoby. Kompozytor przełącza je pigułkami.
- **Zdjęcia:** do 4 na wpis, z przycisku, wklejenia (Ctrl+V) albo przeciągnięcia. Zmniejszane w przeglądarce (do 1400 px, JPEG) i zapisywane w danych wpisu; łączny limit pamięci zdjęć to ok. 3,5 MB, dopóki dane są lokalne. Galeria 1–4 zdjęć, klik otwiera powiększenie (←/→, Esc).
- **Strumień:** zapisy czasu pracy starsze niż 14 dni nie wchodzą do osi (są w „Czasie” projektu); czas pokazywany jako minuty lub godziny, nigdy „0 h”.
- Filtry: Wszystko, Moje, Pisma, Wpisy, Zdjęcia.

## Analiza w projekcie i edycja wpisów

- Zakładka **Analiza** w projekcie (`#/projekty/<id>/analiza`) pokazuje ten sam szczegółowy widok co ekran Analizy, ale dla jednego projektu. Widzi ją lider projektu i zarząd; pracownikowi zakładka się nie wyświetla, a po wpisaniu adresu dostaje wyjaśnienie.
- Autor może poprawić własny wpis (ikona ołówka; Ctrl+Enter zapisuje, Esc anuluje). Karta dostaje ślad „edytowano”. Ankiety i zdjęcia nie są edytowane, tylko treść.
- Stan projektu w panelu bocznym Aktualności używa tego samego znaku (trójkąt) co menu i lista projektów.

## Audyt spójności i ekran startowy

- Audyt (jasny, ciemny, telefon) potwierdził wspólny język kart i pigułek. Poprawki: nagłówki tabeli Zespołu jak w Projektach; na telefonie filtry są jednym przewijanym rzędem, a tabela projektów pokazuje numer, nazwę i stan (czas umowy, lider, sygnały i termin schodzą; są w karcie i w widoku projektu).
- **Ekran startowy** (`src/ui/welcome.js`): jedna karta „Zacznijmy od trzech kroków” (osoby → kim jesteś → pierwszy projekt, z odhaczaniem i wyborem osoby jednym kliknięciem) dla Skrzynki, Mojej pracy, Aktualności i Analizy, gdy nie ma jeszcze zespołu albo wybranej osoby. Projekty i Zespół mają własne, bogatsze ekrany startowe.

## Analiza v2: widoki, wykresy w pikselach, stawki osób
- **Wykresy o zmiennej szerokości** (`Charts.scatter/burn/weekly/timeline`) rysują się przez `Charts.fit` w realnych pikselach kontenera (ResizeObserver); czcionka osi zawsze 11 px, nic się nie skaluje. Małe (pierścień, donut, sparkline) mają stały rozmiar.
- **Zakładki Analizy** (`.an-tabs`, stan `analysisTab`): Przegląd · Projekty · Zespół · Finanse (tylko zarząd) · Wyceny.
- **Klocki HTML** zamiast SVG tam, gdzie liczy się tekst: `hbars` (`.an-hb`, kreska = wartość odniesienia), `diverging` (wokół zera), `heatmap` osoby × tygodnie (`.an-hm`, barwa = udział w 40 h), pasek kosztu/prognozy/marży (`.an-split`), chipy sygnałów (`.an-chips`).
- **Koszt godziny** jest polem osoby (`person.hourlyCost`, edytuje tylko zarząd); koszt projektu = Σ godziny × stawka osoby, korekty zarządu liczone średnią stawką projektu. Wartość wypracowana = wartość umowy × postęp rzeczowy; „marża na wykonanej pracy” = wartość wypracowana − koszt.
- **Budżet godzin przy zakładaniu projektu**: pole „Budżet godzin projektu” dzieli sumę na zaznaczone etapy proporcjonalnie do standardu (`Model.distributeHours`, metoda największych reszt); godziny każdego etapu są edytowalne, a pod polem widać różnicę względem budżetu.
- Koszty zewnętrzne (geodeta, opłaty) — osobna zakładka w następnym etapie; analiza jest na nie przygotowana.

## Pismo → zadanie → czas: jeden właściciel sprawy

Pismo przychodzące oczekujące na odpowiedź ma w danej chwili jednego „właściciela” (`Mail.handling`):
- **new** — nikt się nie zajął (brak zadania z pisma): pismo jest w „Wymaga reakcji” u lidera/koordynatora **od razu po wpisaniu** (bez okna 3 dni), z akcjami „Utwórz zadanie” / „Napisz odpowiedź”;
- **taken** — jest otwarte zadanie: pismo znika z reakcji, sprawę prowadzi zadanie (termin, wykonawca, czas); w Korespondencji pismo ma plakietkę „W realizacji” i chip zadania z godzinami;
- **finished** — zadania zakończone, odpowiedzi nie zarejestrowano: pismo wraca do reakcji z akcją „Zarejestruj odpowiedź”.
Pismo zamyka dopiero zarejestrowana odpowiedź (`replyTo`); po jej wpisaniu toast proponuje „Zamknij zadanie/zadania” z pisma. Pisma wychodzące nie trafiają do reakcji (czekamy na cudzą odpowiedź).
- **Wymaga odpowiedzi?** (formularz pisma przychodzącego) zastępuje dawną opcjonalną datę i checkbox: „Tak” wymaga terminu, który podpowiada rodzaj pisma (`Mail.suggestReplyDue`: wezwanie/decyzja/opinia/zapytanie 14 dni, postanowienie 7, wniosek 30; umowa, zawiadomienie, odpowiedź, inne — bez odpowiedzi), liczony od daty wpływu. „Nie” nie pokazuje pola terminu. Pismo wychodzące ma tylko nieobowiązkowe „Oczekujemy odpowiedzi do”.

(Poniżej opis wcześniejszej wersji — Skrzynka została scalona z „Moją pracą”, patrz sekcja wyżej.)
- **Zadanie z pisma** (opcjonalne): w Korespondencji przycisk „Utwórz zadanie z pisma” (pod pismem oraz w menu wiersza) otwiera zwykły formularz zadania z wybieralnym etapem, nazwą z numeru pisma, terminem odpowiedzi i zespołem. Zadanie zapamiętuje pismo w `task.mailId`. Czas rejestruje się na zadaniu, więc liczy się do budżetu etapu i Analizy; kilkadziesiąt godzin nad jednym wezwaniem to zwykłe godziny zadania.
- Pismo pokazuje powiązane zadania (status i suma godzin, `Mail.linkedTasks`), zadanie w panelu ma pole „Z pisma”. Pismo kończy się jak dotąd: zarejestrowaną odpowiedzią.
- **Moja praca** nie ma wprowadzeń ani zdań wyjaśniających na ekranie: „dlaczego to widzę” (`item.why`) i opis sekcji są w dymkach po najechaniu lub fokusie. Pismo z zadaniem to jeden wiersz (zadanie nie powtarza się na liście). Akcje wg rodzaju: pismo — Utwórz zadanie / Otwórz zadanie + Napisz odpowiedź.

## Wyjaśnialność stanu, radar i zdarzenia

- **Stan zawsze z powodem.** `Insight.explain(project, now, waitingMail)` zwraca nagłówek, powody i mierniki z progami (termin umowy, harmonogram, zadania po terminie, zwroty, pisma po terminie) także dla „W normie”. Znacznik stanu to przycisk (`Flow.stateButton`): na liście i w nagłówku otwiera kartę `.xs` (popover) z akcjami z `Insight.attentionItems`; w kartach i w wierszu listy klik w linię powodu robi to samo. Pismo po terminie jest powodem stanu (`mail-late`, ostrzeżenie); aplikacja podaje dziennik pism raz (`Insight.setMailSource`), więc wszystkie oceny stanu są spójne.
- **Radar terminów jako filtr.** Nagłówki sekcji (`.pf-rail__filter`) wywołują `filterPortfolio`: Po terminie → `health: overdue`, Ten tydzień / Później → `horizon` 7 / 60 dni; drugi klik zdejmuje filtr (`aria-pressed`).
- **Obciążenie osób** (zarząd): `.load--cap` — procent (średnia godzin z 4 tygodni wobec 40 h), pasek, godziny i opis; progi: <40% wolna przepustowość, 85–110% pełne obłożenie, >110% przeciążenie. Pozostali widzą tylko liczbę zadań.
- **Zdarzenia w Aktualnościach.** `Events.detect` porównuje odcisk stanu (status projektu, statusy etapów, poziom stanu) i zapisuje w `social.events` (limit 200) oraz `social.health` (ostatnio widziane poziomy, wykrywanie zmian między sesjami). Zmiany hurtowe (dane przykładowe, wczytanie kopii) nie generują zdarzeń (`quietly`). Ten sam poziom nie wraca częściej niż co 12 h. Karta zdarzenia ma szynę w kolorze poziomu, ikonę systemową i kontekst „kod → etap”.

## Barwa projektu: pełny kolor, stan jako ramka

- Każdy projekt ma stałą barwę z kodu (`Identity.tileHue`, zakres 150–290: zielenie–fiolety). Czerwień i bursztyn są zarezerwowane dla stanu.
- Kafle i wiersze tabeli to pełnokolorowe gradienty z białym tekstem; nagłówek projektu to pełnokolorowy baner (`.pd-hero`); kody projektów wszędzie (`Aktualności`, `Moja praca`, `Analiza`, `Zespół`, panel terminów) to nasycone pigułki; w panelu bocznym projekt ma kolorowy znacznik.
- Stan (alarm / uwaga) to zewnętrzna ramka z odstępem i pełna plakietka, nigdy poświata ani pasek wewnątrz koloru projektu.
- Barwę przekazuje się przez zmienną `--hue` (`Identity.hueStyle(kod)`).
- Paleta projektu liczona jest w oklch (`--pj-a`, `--pj-b`, `--pj-glow`): na ekranach P3 i HDR chroma rośnie (`@media (color-gamut: p3)`, `@media (dynamic-range: high)`). Do tego połysk na górnej krawędzi i kolorowa poświata pod kaflem.
- Ramkę dostaje tylko alarm; uwaga to plakietka i ikona. Zaległość to biała plakietka z czerwonym tekstem (czytelna na każdym kolorze).

## Panel boczny „aurora”

Tło okna (`body`, `.app`) to głęboka granatowo-morska baza z trzema łunami w oklch (turkus, błękit, morska zieleń); na ekranach P3 łuny są mocniejsze. Panel boczny ma lokalnie odwrócone tokeny tuszu (biały tekst, szklane aktywne pozycje z poświatą), więc logo, ikony i liczniki zmieniają się same. Arkusz treści pływa nad tłem bez zmian. Na telefonie szuflada ma tę samą aurorę.

## Jeden język „aurora” w całej aplikacji

Pasek boczny, nagłówek każdego ekranu (`.page-header`), baner projektu i przycisk główny należą do jednej rodziny: głęboki morski granat z turkusem (magenta marki tylko jako drobny akcent) (`--aurora-1`, `--aurora-2`, `--grad-aurora`) i konturami warstwic. Arkusz treści jest jasny dla czytelności, ale ma chłodno-fioletowy ton linii i wnęk, połysk na górnej krawędzi kart (`--card-gloss`) i łunę aurory u góry. Barwę projektu niosą kafle, wiersze, baner, kody, kropka w panelu i lewa krawędź wierszy w „Mojej pracy”. Stan (alarm, uwaga) pozostaje czerwienią i bursztynem.

## Wygląd: motywy kolorystyczne, HDR, intensywność i kontrast

Cały język „aurora” żyje w `styles/aurora.css` i jest sterowany czterema ustawieniami (Ustawienia → Wygląd, zapisywane w preferencjach):

- **Motyw kolorystyczny** (`data-palette`): ciemne: morski (domyślny), grafit, leśny, zachód, fiolet; jasne: niebo (`sky`), mięta (`mint`), brzoskwinia (`peach`), lawenda (`lilac`). Jasne motywy mają pastelowe tło okna i jasny panel boczny z ciemnym tekstem (przez `light-dark()`, więc w ciemnym trybie systemu wracają do ciemnej wersji), a baner nagłówka jest jaśniejszy, ale nadal pod białym tekstem. Paleta ustawia odcienie tła okna, paska bocznego, nagłówków, przycisku głównego i lekki ton arkusza (`--au-h1/h2/h3`, `--au-bh`, `--au-sat`).
- **HDR** (`data-hdr="off"` → `--hdr: 0`): wyłączony usuwa połysk, kolorowe poświaty i rozszerzoną gamę; włączony używa P3 / ekranu HDR (`@media (color-gamut: p3)`, `(dynamic-range: high)`).
- **Intensywność kolorów** (`--vivid` 0,4–1,5): mnoży chromę aurory i barw projektów.
- **Kontrast** (`--ctr` −1…+1): ciemniejsze tła pod białym tekstem, mocniejsze linie, ciemniejszy tekst w jasnym motywie i jaśniejszy w ciemnym. Granice tekstu pomocniczego dobrano tak, by przy skrajnych ustawieniach nie schodził poniżej AA.

Suwaki dają podgląd na żywo (`actions.previewLook`), zapis następuje po puszczeniu. „Przywróć domyślny wygląd” cofa wszystko. Kolory stanu (alarm, uwaga) nie zależą od motywu.

## Pomiar czasu: pasek dnia, zegar, luki i tydzień

- **Pasek dnia w górnej belce** (`Timer.dayRibbon`): stała oś 6–22 (rozszerzana do pełnych godzin, gdy zapis wychodzi poza nią). Każdy wpis to odcinek w miejscu, w którym naprawdę był, w barwie projektu (`Identity.tileHue`, ta sama co kafel i wiersz projektu) z kodem projektu w środku, gdy odcinek jest dość szeroki (container query). Chodzący zegar rośnie na żywo do znacznika „teraz” (`refreshRibbon` co 0,5 s, bez przerysowania). Podpowiedź odcinka: projekt, zadanie, godziny, czas. Po całym dniu zostaje kolorowy zapis pracy.
- **Zegar z datą** (`Timer.nowClock`, `TimeLog.clockLabel`): dzień tygodnia, data, godzina; podpowiedź z pełną datą i numerem tygodnia ISO. Na telefonie zostaje sama godzina.
- **Panel „Dzisiaj”**: luki bez zapisu (`TimeLog.gaps`, ≥ 20 min) jako prążki na osi dnia z podsumowaniem, pasek tygodnia pon–ndz (`TimeLog.weekDays`, weekend tylko gdy ma zapis) z kreską normy 8 h i podziałem na projekty, prognoza „norma o HH:MM” przy chodzącym zegarze.
- Belka ustępuje miejsca w kolejności: pasek, potem zegar zadania; okruszki mają minimum 7,5 rem. Poniżej 30 rem znikają suma i pasek.

## Czas: wpis od–do, przypomnienie, budżet i ekran „Czas”

- **Wpis od–do**: formularz czasu przyjmuje zakres godzin (`from`/`to`) albo liczbę godzin; wpisane godziny mają pierwszeństwo przed zakresem. Nakładanie się wpisów jest odrzucane z komunikatem.
- **Dopisywanie z paska**: kliknięcie luki (kreskowanej) na osi dnia albo przeciągnięcie po pasku otwiera formularz z wypełnionym zakresem.
- **Przypomnienie o końcu dnia**: gdy zegar chodzi po „Koniec dnia” (Ustawienia → Czas pracy) albo ≥10 h, okno pyta: ostatnia aktywność / koniec dnia / teraz / ręcznie / zostaw.
- **Budżet przy zegarze**: chip z procentem zużycia budżetu etapu; godziny widzą tylko lider i zarząd.
- **Ekran „Czas” (`#/czas`)**: karta czasu (tydzień/miesiąc, eksport CSV: BOM, `;`, CRLF) i plan obciążenia (szacunek `task.estimate` lub domyślny wg wielkości, rozłożony na dni robocze do terminu, pojemność = dni × cel dnia; stany ok/tight/over). Zarząd widzi wszystkich, reszta tylko siebie.

## Kolory projektów, kafle wskaźników i panel boczny

- **Paleta 40 kolorów** (`Identity.swatches()`): 20 barw od żółtozielonej po różową (czerwień i bursztyn zostają dla stanów) × dwa tony (jaśniejszy / głębszy). Kolor wynika z numeru projektu (ostatnie dwie cyfry kodu, krok 7 w permutacji), więc kolejne numery w roku różnią się wyraźnie, a 40 projektów z rzędu nie powtarza koloru.
- **Wybór ręczny**: `project.color` (indeks 0–39 albo `null` = automatyczny), pole „Kolor projektu” w formularzu projektu (zakładanie i edycja). `Identity.setColors(projects)` jest wołane przy każdym renderze, więc `tileHue/tileTone/hueStyle/segStyle` biorą kolor wybrany ręcznie w kaflu, pillach, pasku czasu i karcie czasu. Zmienne CSS: `--hue` + `--tone` (kafle), `--seg-h` + `--seg-t` (paski).
- **Jeden kafel wskaźnika**: `.pd-prop` (projekt), `.ts-stat` (Czas), `.an-tile` (Analiza) mają wspólny wygląd (tło, obrys, cień, odstępy, etykieta 11 px wersalikami, wartość 1,25 rem, podpis xs). Nowy kafel wskaźnika używa tych samych reguł.
- **Wysuwany panel boczny**: `UI.railLayout({id, title, collapsed, onToggle, main, side, badge})`. Stan zwinięcia w `prefs.collapsedRails`, przełączany akcją `toggleRail(id)`. Używany w „Mojej pracy” (zegar i projekty) i w „Czasie” (panel dnia); lista projektów ma własną wersję „Najbliższe terminy” (`prefs.railCollapsed`).

## Audyt UI i standard rozmiarów

Pomiar komputowanych stylów na wszystkich ekranach wykazał rozjazdy; ujednolicono je tak:

| Element | Przed | Standard |
|---|---|---|
| Zakładki-pigułki | 37 px (Czas, Analiza) i 44 px (reszta) | 38 px (pigułka 32 px + 3 px ramka) |
| Zaokrąglenie kart | 14, 16, 18, 20, 22 px | kafel wskaźnika 16, karta/panel 18, nagłówek strony 20 |
| Nagłówek strony | 112 px, tytuł 2,5 rem | ~92 px, tytuł 2 rem |
| Kafel wskaźnika | 91–135 px, wartość 1,25–1,5 rem | ~72 px, wartość 1,125 rem |
| Macierz karty czasu | wiersz 48 px, nagłówek 56 px | wiersz 36 px, zadanie 32 px, nagłówek ~44 px |

**Kafle projektów** mają dwa tryby (`prefs.tilesFull`, atrybut `data-tiles="full"`):
- **spokojny (domyślny)**: neutralna powierzchnia, kolor projektu w pasku z lewej (6 px), numerze i delikatnym tle; czerwony obrys tylko dla alarmu; baner projektu o 40% mniej nasycony;
- **pełny kolor**: dotychczasowe gradienty (Ustawienia → Wygląd → „Kafle w pełnym kolorze”).

## Rodzaj projektu i jednolite kafle

- **Rodzaj projektu** (`core/kinds.js`): jaz, zapora, zbiornik/staw, pompownia, elektrownia wodna, wały, mała retencja, rzeka/przepust, ekspertyza/OST, inny. `project.kind` wybierany w formularzu („Rodzaj projektu”) albo rozpoznawany z nazwy po słowach kluczowych (`Kinds.of(project)`).
- **Kreskowa grafika** (`ui/kindArt.js`, siatka 120×80, kontur `currentColor`): jasny znak wodny w rogu kafla i banera projektu, mała ikona obok numeru na liście. Kolor tła zostaje do rozróżniania numerów, grafika mówi o typie.
- **Kafle w jednolitym kolorze** (domyślnie): płaski, średnio nasycony kolor projektu, bez połysku, warstwic i poświaty. Wersja z gradientem i połyskiem: Ustawienia → Wygląd → „Kafle z połyskiem” (`data-tiles="full"`).

## Mapa cieplna: jeden standard (Analiza, Czas, Plan)

Trzy siatki — obciążenie w Analizie, karta czasu i plan obciążenia — mają identyczny wygląd: karta `an-card` z tytułem i jednozdaniowym opisem, komórki `an-hm__c` (1,9 rem, zaokrąglenie 6 px, odstęp 3 px), nagłówki kolumn w jednym wierszu (jasne, bez pogrubień; dzisiejszy dzień akcentem), podsumowanie po prawej (godziny + procent). **Jedna skala barw** dla wszystkich: spokojna → bursztyn (>85%) → czerwień (>105%), natężenie rośnie z udziałem. Kolor projektu niesie tylko plakietka z numerem. W gęstym widoku miesiąca godziny są zaokrąglone do całych, a dokładna wartość jest w podpowiedzi.

## Audyt: układ, dotyk, wydruk

- Siatki widoków (`.view`, `.fd__main`) mają kolumnę `minmax(0, 1fr)` — treść nie może rozpychać ekranu ponad szerokość telefonu.
- Panel boczny listy projektów znika poniżej 1180 px także w pliku `aurora.css` (późniejsze reguły nie przywracają drugiej kolumny).
- Na urządzeniach dotykowych (`pointer: coarse`) małe kontrolki (checkbox, przełącznik, strzałka rozwinięcia, sortowanie) mają pole trafienia ok. 36 px bez zmiany wyglądu.
- Wydruk (`@media print`): A4 poziomo, bez paneli i przycisków, kolory zachowane — karta czasu i plan nadają się do wydrukowania.
- Usunięto nieużywane reguły CSS (stare kafle, „na żywo”, stary pasek rodzajów) oraz zdublowane zrzuty ekranu z katalogu głównego.

## Stan projektu i paleta (v2)

- **Znak stanu** (`Sig.datum`) to okrąg, nie trójkąt: alarm = pełne czerwone koło z wykrzyknikiem, uwaga = bursztynowy pierścień z wykrzyknikiem, w normie = mała kropka, zakończony = pierścień z haczykiem. Kształt różni się nie tylko barwą.
- **Brak kolorowych obramowań** kafli i wierszy dla stanu. Stan niesie znak, plakietka „Alarm / Uwaga” i powód.
- **Paleta 40 kolorów**: 20 barw (miedź i brąz, zieleń, błękity, fiolety, róż) × 2 tony; czerwień, bursztyn i oliwka pominięte. Ciepłe barwy stoją w liście tak, by nie wypadały przy kolejnych numerach.
- **Barwa kafla** (Ustawienia → Wygląd): „według numeru projektu” (domyślnie) albo „według rodzaju projektu” (rodzina barw rodzaju, numer tylko ją odcienia). Kolor wybrany ręcznie w projekcie ma pierwszeństwo.

## Zakres opracowania i procedury

Projekt ma dwa niezależne opisy: **rodzaj projektu** (co projektujemy: jaz, pompownia, staw… — grafika i barwa kafla) oraz **zakres opracowania** (co klient zamawia). Zakres: pełny projekt, projekt okrojony (np. remont na zgłoszenie z dokumentacją wykonawczą i kosztorysową), koncepcja, ekspertyza / ocena stanu, inny (ręcznie). Zakres nie jest szablonem: tylko ustawia domyślny zaznaczony zestaw etapów z jednego standardu (`Catalog.SCOPES`, `Catalog.stagesFor`). Cztery **procedury formalne** (środowiskowe, lokalizacyjne, wodnoprawne, pozwolenie na budowę) to przełączniki, z których każdy dokłada parę „dokumentacja + postępowanie”. Wszystko można ręcznie zmienić w formularzu i potem w planie projektu; nowe zakresy to jeden wpis w katalogu, nie kolejny szablon. Standard liczy 17 etapów (dodany: „Ocena stanu istniejącego i ekspertyza”).
