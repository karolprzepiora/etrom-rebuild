# Model danych ETROM pod serwer (Supabase)

Dokument roboczy z 9 października 2026. Opisuje, co aplikacja zapisuje dziś (jeden obiekt `workspace` w `localStorage`) i jak to rozłożyć na tabele, gdy dane przejdą na serwer. Zasady: każdy rekord osobno, stały identyfikator, autor i data zmiany, brak twardego kasowania, uprawnienia egzekwowane w bazie.

Decyzje: logowanie e-mailem i hasłem; konta zakłada zarząd, nadaje login, hasło i rolę; przejście na Supabase dopiero po dalszym rozwoju aplikacji.

## Role

| Rola | Kto | Widzi |
|---|---|---|
| `dyrekcja` | zarząd | wszystko, zakłada konta, nadaje role |
| `kierownik` | lider lub koordynator konkretnego projektu | wszystko w swoich projektach: godziny osób, budżet, zamrożone zadania |
| `pracownik` | pozostali | własne wpisy czasu, własne zadania, terminy, sprawy w toku, korespondencję; **nigdy** godzin zaplanowanych, budżetu, stawek ani cudzego czasu |

Rola kierownika jest przypisaniem do projektu (`project_team`), a nie cechą osoby. Dyrekcja i pracownik to rola globalna (`profiles.role`).

## Tabele

| Tabela | Dziś | Najważniejsze pola | Uwagi |
|---|---|---|---|
| `profiles` | `people` | id (= konto logowania), imię, nazwisko, stanowisko, rola globalna, współpraca, aktywny | stawka godzinowa przeniesiona do `person_rates` |
| `person_rates` | `people.hourlyCost` | person_id, stawka, obowiązuje od | tylko dyrekcja; z historią zmian stawki |
| `projects` | `projects[]` | id, kod, nazwa, klient, status, termin, kolor, rodzaj, zakres, priorytet, wartość umowy, baseline (zamrożony plan), plan zaakceptowany | wartość umowy i baseline: kierownik i dyrekcja |
| `project_team` | `project.team` | project_id, person_id, funkcja (lider, koordynator, członek) | z tego wynika rola kierownika |
| `stages` | `project.stages[]` | id, project_id, katalog lub własny, kolejność, nazwa, rodzaj, status, status ręczny, zamknięty automatycznie, termin, waga, zamrożony, rezerwa, flaga budżetu | godziny i wagi: tylko kierownik i dyrekcja |
| `stage_hours` | `stage.hours/adjustments` | stage_id, godziny, korekty | kierownik i dyrekcja |
| `tasks` | `stage.tasks[]` | id, stage_id, nazwa, status, termin, od kiedy, zamrożone, szacunek | pracownik widzi zadanie dopiero po dodaniu do realizacji |
| `task_assignees` | `task.assignees/parts` | task_id, person_id, status części | |
| `task_history` | `task.history` | task_id, z, na, powód, kiedy, kto | tylko dopisywanie |
| `checklist_items` | `task.checklist` | id, task_id, tekst, zrobione, dodał, przypisany, zrobił, kiedy | widzą wszyscy przy zadaniu |
| `time_entries` | `entries[]` | id, person_id, project_id, stage_id, task_id, start, koniec, notatka, źródło, zmieniono | pracownik: własne; kierownik: w swoich projektach; dyrekcja: wszystkie. Suma na zadaniu bez rozbicia na osoby dla pozostałych |
| `mail_entries` | `mail[]` | id, project_id, kierunek, nr rejestru, dane pisma, odpowiedź na, autor, daty | dziennik pism, bez „czeka na odpowiedź” |
| `cases` | `cases[]` | id, project_id, stage_id, nazwa, urząd, właściciel, data złożenia, status, zamknięcie, zadanie źródłowe | widzą wszyscy |
| `case_events` | `case.events[]` | id, case_id, rodzaj, data, notatka, zadanie, kto | |
| `absences` | `absences[]` | id, person_id, od, do, rodzaj, notatka | później z wnioskami urlopowymi i akceptacją |
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

- Zakładka wniosków urlopowych: kto akceptuje i jak liczymy dni.
- Czy kierownik widzi stawki godzinowe osób, czy tylko dyrekcja.
- Czy komentarze i aktualności są wspólne dla biura, czy per projekt.
- Zasady archiwizacji: po jakim czasie projekt przestaje być „aktywny”.
