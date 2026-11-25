import { act, renderHook } from '@testing-library/react'
import { useDescanso } from './descanso'

describe('useDescanso', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('cuenta hacia atrás y avisa al llegar a cero', () => {
    const avisar = vi.fn()
    const { result } = renderHook(() => useDescanso(avisar))
    expect(result.current.activo).toBe(false)
    act(() => result.current.iniciar(3))
    expect(result.current.activo).toBe(true)
    expect(result.current.restante).toBe(3)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.restante).toBe(2)
    expect(avisar).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2100) })
    expect(result.current.restante).toBe(0)
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(result.current.terminado).toBe(true)
  })

  it('ajusta el tiempo con +15 / -15 y se puede saltar', () => {
    const { result } = renderHook(() => useDescanso(() => {}))
    act(() => result.current.iniciar(60))
    act(() => result.current.ajustar(15))
    expect(result.current.restante).toBe(75)
    act(() => result.current.ajustar(-15))
    act(() => result.current.ajustar(-15))
    expect(result.current.restante).toBe(45)
    act(() => result.current.saltar())
    expect(result.current.activo).toBe(false)
  })

  it('restar más que lo que queda termina el descanso', () => {
    const avisar = vi.fn()
    const { result } = renderHook(() => useDescanso(avisar))
    act(() => result.current.iniciar(10))
    act(() => result.current.ajustar(-15))
    act(() => { vi.advanceTimersByTime(300) })
    expect(avisar).toHaveBeenCalledTimes(1)
    expect(result.current.restante).toBe(0)
  })

  it('un descanso de 0 segundos no arranca', () => {
    const { result } = renderHook(() => useDescanso(() => {}))
    act(() => result.current.iniciar(0))
    expect(result.current.activo).toBe(false)
  })
})
