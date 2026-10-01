# ETROM v2 — Zarządzanie Projektami

🚀 Przebudowana aplikacja ETROM od nowa w React + TypeScript + Tailwind CSS.

## MVP v1.0 Features

✅ **Projekty** — Lista projektów w widoku kart z:
- Kod, nazwa, klient
- Status (Planowanie/Aktywny/Wstrzymany/Zakończony)
- Postęp etapów (progress bar)
- Podgląd zespołu

✅ **Zarządzanie** — Dodawanie, edycja, usuwanie projektów

✅ **Przechowywanie** — localStorage JSON (kompatybilne ze starym ETROM)

## Instalacja

```bash
# 1. Instalacja dependencies
npm install

# 2. Development server
npm run dev

# 3. Build do produkcji
npm run build

# 4. Preview buildowanej aplikacji
npm preview
```

Otwórz w przeglądarce: `http://localhost:5173`

## Struktura Projektu

```
src/
├── components/       # Komponenty React
│   └── ProjectCard.tsx
├── pages/           # Strony aplikacji (przyszłość)
├── stores/          # Zustand state management
│   └── workspaceStore.ts
├── types/           # TypeScript interfaces
│   └── index.ts
├── utils/           # Utility functions
├── styles/          # Global styles
├── App.tsx          # Root component
├── main.tsx         # Vite entry point
└── index.css        # Tailwind CSS
```

## Tech Stack

- **React 19** — Framework UI
- **TypeScript** — Type safety
- **Tailwind CSS** — Styling (5k lines zamiast 37k!)
- **Zustand** — State management
- **Vite** — Build tool
- **localStorage** — Data persistence

## Plan Dalszego Rozwoju

### Phase 2 (Tydzień 2-3)
- [ ] Stages (Etapy) w projekcie
- [ ] Team (Zarządzanie osobami)
- [ ] Filtry i sortowanie
- [ ] Responsive design

### Phase 3 (Tydzień 4+)
- [ ] Planning View (Plan pracy)
- [ ] Supervision View (Nadzór)
- [ ] Time tracking
- [ ] Backend (Node.js + PostgreSQL)

## Development

```bash
# Uruchomić dev server z hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Build production
npm run build
```

## Migracja Danych

Aplikacja automatycznie wczytuje dane z localStorage pod kluczem `etrom.workspace.v2`. Jeśli masz stare dane, będą automatycznie załadowane.

## Autor

Claude Haiku 4.5 — AI Developer  
🚀 Przebudowuję ETROM od nowa, krok po kroku!
