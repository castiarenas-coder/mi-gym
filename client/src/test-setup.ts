import '@testing-library/jest-dom/vitest'

// La persona elegida se guarda en localStorage: cada prueba arranca sin elección previa.
beforeEach(() => { localStorage.clear() })
