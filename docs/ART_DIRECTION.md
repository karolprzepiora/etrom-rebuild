# ETROM — kierunek artystyczny

Ten dokument opisuje **język wizualny ETROM**: skąd się wziął, z czego się składa
i czego świadomie unika. Zasady techniczne (tokeny, komponenty, dostępność) są
w [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

## Skąd ten język

ETROM prowadzi projekty biura hydrotechnicznego: regulacje rzek, przepusty,
zbiorniki, wały. Ta praca ma własny język: **stany wód** (normalny,
ostrzegawczy, alarmowy), **rzędna** zaznaczana trójkątem ▽ na przekroju,
**profil podłużny** cieku, **kalka** i **tusz** rysunku technicznego.
Zamiast pożyczać estetykę panelu SaaS, interfejs mówi tym językiem —
bez ilustracji, wyłącznie formą.

Charakter: **precyzja kreślarska, spokój dobrego narzędzia, odrobina ciepła.**

## Tożsamość z logo

Paleta wychodzi z logo ETROM: **łupek** (`#78909c`) nadaje chłodny odcień kalce, arkuszowi
i tuszowi; **magenta** (`#dd5799`) jest drobnym znakiem marki i niczego nie oznacza
(logo, wskaźnik aktywnej pozycji, zaznaczenie tekstu).

## Trzy decyzje, które robią różnicę

### 1. Kolor znaczy „teraz” albo „ryzyko” — nic więcej

Interfejs jest pisany **tuszem** (grafit). Kolor ma tylko dwie role:

- **Nurt** (stalowy błękit wywiedziony z łupka logo, `--flow`) — to, co dzieje się teraz: etap w toku,
  zadanie w toku, projekt w realizacji, pierścień bieżącego etapu.
- **Stany ryzyka** — bursztyn (stan ostrzegawczy) i czerwień (stan alarmowy).

To, co zakończone, **zostaje wyciągnięte tuszem** — jak linia na kalce.
Przycisk główny, zaznaczenie, aktywna pozycja nawigacji: tusz, nie kolor marki.
Jedno spojrzenie wystarcza, żeby zobaczyć, gdzie jest ruch, a gdzie problem.

### 2. Dwa kroje o różnych zadaniach

Oba osadzone w aplikacji (`styles/fonts.css`), więc wyglądają tak samo
na każdym komputerze i działają bez sieci.

- **ETROM Display** (Instrument Sans) — tytuły ekranów, nazwy projektów, liczby
  kluczowe. Zwarty, zdecydowany, z ciasnym światłem w dużych rozmiarach.
- **ETROM Text** (Inter) — cała praca operacyjna: wiersze, formularze, menu.
  Cyfry tabelaryczne, jednoznaczne `l`/`I`, czytelne po sześciu godzinach.

Kod projektu składany jest krojem tekstowym z cyframi tabelarycznymi
i przekreślonym zerem — jak numer rysunku, bez kroju maszynowego.
Hierarchia wynika z kroju, wielkości i grubości: ekran działa po zdjęciu
kolorów i cieni.

### 3. Warstwy zamiast ramek

| Warstwa | Rola |
|---|---|
| **Kalka** (`--canvas`) | tło okna; na niej leży panel nawigacji, bez ramki |
| **Arkusz** (`--sheet`) | obszar pracy: uniesiony nad kalką, zaokrąglony 14 px |
| **Ton** (`--wash`, `--wash-2`) | grupy w arkuszu: kokpit, nagłówek projektu, wnęki |
| **Arkusz pływający** (`--raised`) | inspektor, menu, okna |

Aktywna pozycja nawigacji „wznosi się” z kalki do poziomu arkusza.
Linie zostały tam, gdzie niosą strukturę: w profilu, na osi etapów, w tabelce faktów.

## Elementy charakterystyczne

### Rzędna ▽ — znak stanu projektu

Trójkąt rzędnej z kreską poziomu, jak na przekroju. Cztery stany wzięte
z hydrologii: **w normie** (kontur), **stan ostrzegawczy** (bursztynowe
wypełnienie), **stan alarmowy** (czerwone wypełnienie ze znakiem), **zakończony**
(cienki kontur). Kształt odróżnia stan od koloru — da się go odczytać
w czerni i bieli. Zawsze idzie w parze z **powodem** w słowach
(„Termin umowy minął 6 dni temu”, „2 etapy po terminie”).

Stan liczony jest w `src/core/insight.js` z terminu umowy, etapów i zadań
po terminie oraz z **opóźnienia wobec czasu** — różnicy między upływem
czasu umowy a postępem pracy.

### Profil przebiegu

Projekt narysowany jak profil podłużny cieku. Każdy etap to odcinek
o długości proporcjonalnej do **budżetu godzin** — tak samo liczony jest
postęp, więc długość wyciągniętej tuszem części *jest* procentem postępu.

- zakończone — tusz,
- w toku — nurt z kreskowaniem, które płynie kilka sekund po wejściu,
- po terminie — czerwone kreskowanie jak w przekroju, nie plama koloru,
- przyszłe — ślad.

Trzy skale z jednym znaczeniem: **mikro** w wierszu listy, **karta**
z grotem ▽ i procentem, **makro** w nagłówku projektu z numerami etapów
i dużą liczbą, która dolicza się do nowej wartości. Odcinki makro są
klikalne — prowadzą do etapu.

### Linijka czasu umowy

Pod profilem, w tej samej skali: od założenia projektu do terminu umowy,
z kreską „dziś”. Rozjazd grotu postępu i kreski dnia **to** opóźnienie —
widać je bez czytania liczb.

### Oś etapów

Lista etapów w zakładce Przebieg stoi na pionowej osi: węzeł wypełniony
tuszem z ptaszkiem (zakończony), węzeł nurtu z pierścieniem (w toku),
pusty węzeł (przed nami), czerwony pierścień (po terminie). Zakończone
etapy z początku zwijają się w jedną linię, a bieżący etap otwiera się sam —
to, co dzieje się teraz, jest widoczne bez klikania.

### Kokpit portfela

Nad listą projektów — kompozycja zamiast siatki jednakowych kafli:
dominuje liczba projektów wymagających uwagi z powodami, obok rozkład
stanów i oś najbliższych terminów. Wzrok idzie od problemu do szczegółu.

Kokpit nie tylko informuje — **prowadzi do pracy**. Kliknięcie liczby projektów
wymagających uwagi, stanu w legendzie albo „Pokaż N projektów” przy terminach
zawęża listę poniżej; kliknięcie terminu otwiera projekt na właściwym etapie.
Zawężenie widać w pasku filtrów i zdejmuje się je jednym kliknięciem.

### Pierwszy start

Pusty ekran to pierwsze wrażenie, nie wyjątek. Projekty i Zespół na starcie
pokazują ten sam układ: co tu będzie, trzy kroki, jedno główne działanie ze skrótem,
dane przykładowe — i obok cichy podgląd zbudowany z prawdziwych elementów
(rzędnych, profilu, miernika obciążenia), żeby było widać, do czego to prowadzi.

### Inspektor

Drugi, pływający arkusz po prawej. Otwiera **zadanie** (z historią zmian
statusu i udziałami realizatorów), **osobę** (obciążenie, funkcje, otwarte
zadania) albo **projekt z listy** (Spacja na wierszu) — bez przeładowania
widoku. Escape zamyka i oddaje fokus tam, skąd przyszedł.

## Ruch

Ruch tłumaczy ciągłość przestrzeni i nigdy nie opóźnia skutku działania:

- **lista → projekt:** nazwa projektu przelatuje z wiersza do nagłówka,
- **zakładki:** wskaźnik przesuwa się do nowej zakładki,
- **inspektor:** wsuwa się, treść pod nim zostaje na miejscu,
- **zmiana statusu:** węzeł osi „wyskakuje”, wiersz podświetla się raz,
- **postęp:** grot przesuwa się, a liczba dolicza do nowej wartości,
- **zapis:** ptaszek przy „Zapisano” rysuje się na nowo,
- **ruch ciągły** (płynący nurt, pulsujący węzeł) gaśnie po kilku cyklach.

Dane zmieniają się natychmiast; animacja tylko pokazuje, co się stało.
Przy ograniczeniu ruchu w systemie wszystko dzieje się od razu.

## Pytania kontrolne dla każdego nowego ekranu

- Czy ten ekran mógłby należeć do dziesięciu innych aplikacji? Jeśli tak — za mało ETROM.
- Czy w 2–3 sekundy widać najważniejszą informację i stan ryzyka?
- Czy działa bez ramek i bez koloru?
- Czy kolor pojawia się tylko tam, gdzie jest „teraz” albo „ryzyko”?
- Czy będzie wygodny po sześciu godzinach pracy?

## Czego świadomie unikamy

- siatek identycznych kart z jednakowym cieniem,
- gradientów i szkła jako dekoracji,
- napisów wersalikami nad każdą sekcją,
- kroju maszynowego dla danych,
- koloru marki w każdym aktywnym elemencie,
- animacji, które trwają dłużej niż czynność, którą ilustrują.
