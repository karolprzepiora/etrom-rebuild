# Model danych ETROM pod serwer (Supabase)

Dokument roboczy z 9 października 2026. Opisuje, co aplikacja zapisuje dziś (jeden obiekt `workspace` w `localStorage`) i jak to rozłożyć na tabele, gdy dane przejdą na serwer. Zasady: każdy rekord osobno, stały identyfikator, autor i data zmiany, brak twardego kasowania, uprawnienia egzekwowane w bazie.

Decyzje: logowanie e-mailem i hasłem; konta zakłada zarząd, nadaje login, hasło i rolę; przejście na Supabase dopiero po dalszym rozwoju aplikacji.

## Role (decyzja z 9 października 2026)

Dwa poziomy dostępu:

| Poziom | Kto | Widzi |
|---|---|---|
| **Pełny** | **Dyrekcja** (rola w biurze) oraz **Lider** (funkcja w projekcie) | wszystko: godziny osób, budżety, stawki, zamrożone zadania, plan bazowy, wartość umowy. Dyrekcja we wszystkich projektach, Lider w projektach, w których jest liderem |
| **Ograniczony** | **Koordynator** (funkcja w projekcie) i **Pracownik** | własne wpisy czasu, własne zadania, terminy, sprawy w toku, korespondencję. **Nigdy** godzin zaplanowanych, budżetu, stawek, zamrożonych zadań ani cudzego czasu |

Dyrekcja to rola globalna konta (`profiles.role`, dziś `orgRole = managing`). Lider i Koordynator to funkcje przypisane do projektu (`project_team`), więc ta sama osoba może być liderem jednego projektu i koordynatorem drugiego, a w każdym widzi tyle, na ile pozwala funkcja. Pełnomocnik wiodący i dodatkowy mają poziom ograniczony.

Konta zakłada, loguje (e-mail i hasło) i role nadaje dyrekcja.

## Tabele

| Tabela | Dziś | Najważniejsze pola | Uwagi |
|---|---|---|---|
| `profiles` | `people` | id (= konto logowania), imię, nazwisko, stanowisko, rola globalna, współpraca, wymiar urlopu (dni), aktywny | stawka godzinowa przeniesiona do `person_rates` |
| `person_rates` | `people.hourlyCost` | person_id, stawka, obowiązuje od | tylko dyrekcja; z historią zmian stawki |
| `projects` | `projects[]` | id, kod, nazwa, klient, status, termin, kolor, rodzaj, zakres, priorytet, wartość umowy, baseline (zamrożony plan), plan zaakceptowany | wartość umowy i baseline: lider i dyrekcja |
| `project_team` | `project.team` | project_id, person_id, funkcja (lider, koordynator, pełnomocnik wiodący/dodatkowy, członek) | z funkcji lidera wynika pełny dostęp do projektu |
| `stages` | `project.stages[]` | id, project_id, katalog lub własny, kolejność, nazwa, rodzaj, status, status ręczny, zamknięty automatycznie, termin, waga, zamrożony, rezerwa, flaga budżetu | godziny i wagi: tylko lider i dyrekcja |
| `stage_hours` | `stage.hours/adjustments` | stage_id, godziny, korekty | lider i dyrekcja |
| `tasks` | `stage.tasks[]` | id, stage_id, nazwa, status, termin, od kiedy, zamrożone, szacunek | pracownik widzi zadanie dopiero po dodaniu do realizacji |
| `task_assignees` | `task.assignees/parts` | task_id, person_id, status części | |
| `task_history` | `task.history` | task_id, z, na, powód, kiedy, kto | tylko dopisywanie |
| `checklist_items` | `task.checklist` | id, task_id, tekst, zrobione, dodał, przypisany, zrobił, kiedy | widzą wszyscy przy zadaniu |
| `time_entries` | `entries[]` | id, person_id, project_id, stage_id, task_id, start, koniec, notatka, źródło, zmieniono | pracownik: własne; lider: w swoich projektach; dyrekcja: wszystkie. Suma na zadaniu bez rozbicia na osoby dla pozostałych |
| `mail_entries` | `mail[]` | id, project_id, kierunek, nr rejestru, dane pisma, odpowiedź na, autor, daty | dziennik pism, bez „czeka na odpowiedź” |
| `cases` | `cases[]` | id, project_id, stage_id, nazwa, urząd, właściciel, data złożenia, status, zamknięcie, zadanie źródłowe | widzą wszyscy |
| `case_events` | `case.events[]` | id, case_id, rodzaj, data, notatka, zadanie, kto | |
| `absences` | `absences[]` | id, person_id, od, do, rodzaj, notatka, **status** (oczekuje, zaakceptowany, odrzucony), na żądanie, kto i kiedy złożył, kto i kiedy zdecydował, powód, opinie liderów | wniosek urlopowy z akceptacją dyrekcji (wdrożone w aplikacji); pracownik widzi własne i obecność innych bez rodzaju |
| `task_library` | `library.tasks` | id, stage_katalogowy, nazwa | wspólna lista, rośnie |
| `posts`, `comments`, `reactions`, `events` | `social.*` | autor, treść, kiedy, klucz obiektu | aktualności i komentarze |
| `settings_org` | część `prefs` i reguły | próg +10 i +25, godzin dziennie, rezerwa, wagi, kolory rodzajów | wspólne dla biura, edytuje dyrekcja |
| `settings_user` | `prefs` | motyw, kolor pracy w toku, widok, gęstość | osobne dla każdego |
| `audit_log` | nowa | kto, co, kiedy, wartość przed i po | do historii zmian |

## Co trzeba zmienić w aplikacji, zanim przejdziemy na serwer

1. **Spłaszczyć zagnieżdżenia.** Dziś zadanie leży w etapie, etap w projekcie, a zapis to jeden duży obiekt. Na serwerze każdy poziom to osobna tabela, więc zmiana jednego zadania nie może nadpisywać całego projektu.
2. **Zapis przez wymienną warstwę** (lokalna lub Supabase) zamiast bezpośredniego `localStorage`.
3. **Tożsamość z konta** zamiast wyboru „ja” z listy osób.
4. **Podział ustawień** na biurowe i osobiste.
5. **Zdarzenia i „ostatnio widziane stany”** w `social` przenieść do tabel z autorem i datą.
6. **Dopisać brakujące rekordy**: stawki z historią, wnioski urlopowe, dziennik zmian.

## Otwarte decyzje

- Zakładka urlopów: zdecydowano wariant A (akceptuje dyrekcja, lider dopisuje opinię); dni liczone jako robocze.
- Czy Lider widzi stawki godzinowe osób, czy tylko dyrekcja.
- Czy komentarze i aktualności są wspólne dla biura, czy per projekt.
- Zasady archiwizacji: po jakim czasie projekt przestaje być „aktywny”.
